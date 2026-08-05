import { FastifyInstance } from 'fastify';
import * as db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';
import { askLLMJSON } from '../ai.js';
import { runAgentTurn, type FormPlan } from '../agent.js';
import { createConversation, getConversation, deleteConversation, type ConversationState } from '../agentConversations.js';
import { INJECTION_GUARDRAIL, wrapUntrusted } from '../promptSafety.js';

const unconfiguredResponse = {
  description: 'OPENROUTER_API_KEY is not set on the server, or the AI call failed',
  type: 'object' as const,
  additionalProperties: true,
  properties: { error: { type: 'string' } },
  examples: [{ error: 'AI features are not configured on this server (missing OPENROUTER_API_KEY).' }],
};

export default async function aiRoutes(app: FastifyInstance) {
  // Rewrite a single question's label for clarity
  app.post<{ Body: { label?: string } }>('/api/ai/improve-question', {
    preHandler: requireAuth,
    schema: {
      summary: 'Rewrite a question label for clarity',
      body: {
        type: 'object',
        additionalProperties: true,
        properties: { label: { type: 'string' } },
        examples: [{ label: 'whats ur name' }],
      },
      response: {
        200: {
          description: 'The rewritten label',
          type: 'object',
          additionalProperties: true,
          properties: { label: { type: 'string' } },
          examples: [{ label: 'What is your name?' }],
        },
        400: {
          description: 'label is missing',
          type: 'object',
          additionalProperties: true,
          properties: { error: { type: 'string' } },
          examples: [{ error: 'label is required' }],
        },
        502: unconfiguredResponse,
      },
    },
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const label = req.body?.label?.trim();
    if (!label) return reply.status(400).send({ error: 'label is required' });

    try {
      const result = await askLLMJSON<{ label: string }>({
        system: 'You improve form question wording. Rewrite the given question label to be clearer and more concise while preserving its original intent, tone, and level of formality. Return only the rewritten label, nothing else.\n\n' + INJECTION_GUARDRAIL,
        prompt: wrapUntrusted('Question label', label),
        schema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false },
      });
      return { label: result.label };
    } catch (e: any) {
      return reply.status(502).send({ error: e.message });
    }
  });

  // Suggest multiple-choice options for a question
  app.post<{ Body: { label?: string } }>('/api/ai/suggest-options', {
    preHandler: requireAuth,
    schema: {
      summary: 'Suggest multiple-choice options for a question',
      body: {
        type: 'object',
        additionalProperties: true,
        properties: { label: { type: 'string' } },
        examples: [{ label: 'How did you hear about us?' }],
      },
      response: {
        200: {
          description: '3-6 suggested options',
          type: 'object',
          additionalProperties: true,
          properties: { options: { type: 'array', items: { type: 'string' } } },
          examples: [{ options: ['Social media', 'Friend or colleague', 'Search engine', 'Advertisement', 'Other'] }],
        },
        400: {
          description: 'label is missing',
          type: 'object',
          additionalProperties: true,
          properties: { error: { type: 'string' } },
          examples: [{ error: 'label is required' }],
        },
        502: unconfiguredResponse,
      },
    },
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const label = req.body?.label?.trim();
    if (!label) return reply.status(400).send({ error: 'label is required' });

    try {
      const result = await askLLMJSON<{ options: string[] }>({
        system: 'You suggest answer options for a multiple-choice form question. Given the question label, suggest 3 to 6 concise, mutually distinct options a respondent might choose. Cover the most likely real answers.\n\n' + INJECTION_GUARDRAIL,
        prompt: wrapUntrusted('Question label', label),
        schema: { type: 'object', properties: { options: { type: 'array', items: { type: 'string' } } }, required: ['options'], additionalProperties: false },
      });
      return { options: result.options };
    } catch (e: any) {
      return reply.status(502).send({ error: e.message });
    }
  });

  // Draft a full form structure from a prompt, streamed live over SSE as an
  // agentic pipeline (analyze -> outline -> build). May pause mid-pipeline to
  // ask the user a clarifying question — resume by POSTing again with the
  // same conversationId and the answer as `message`. Nothing is persisted
  // until the caller reviews the final plan and calls create-form.
  app.post<{ Body: { conversationId?: string; message?: string } }>(
    '/api/ai/plan-form',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Draft a form from a text prompt (SSE)',
        description: 'Response is `text/event-stream`, not JSON — events are `step`, `question` (pauses for clarification; resume by POSTing again with the same `conversationId` and the answer as `message`), `plan` (the final FormPlan, ready for create-form), `error`, and `done`. Makes no database writes.',
        body: {
          type: 'object',
          additionalProperties: true,
          properties: {
            conversationId: { type: 'string', description: 'Omit to start a new conversation' },
            message: { type: 'string' },
          },
          examples: [{ message: 'A customer feedback form for a bakery, asking about their order, food quality, and whether they\'d recommend us.' }],
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      const message = req.body?.message?.trim();
      if (!message) return reply.status(400).send({ error: 'message is required' });

      let state: ConversationState;
      if (req.body?.conversationId) {
        const existing = getConversation(req.body.conversationId, req.userId!);
        if (!existing || existing.phase !== 'awaiting_clarification') {
          return reply.status(404).send({ error: 'Conversation not found or expired. Please start over.' });
        }
        existing.clarificationAnswer = message;
        state = existing;
      } else {
        state = createConversation(req.userId!, message);
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const send = (event: string, data: object) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify({ conversationId: state.id, ...data })}\n\n`);
      };

      const controller = new AbortController();
      let finished = false;
      reply.raw.on('close', () => {
        if (!finished) {
          controller.abort();
          deleteConversation(state.id);
        }
      });

      try {
        await runAgentTurn(state, (e) => send(e.type, e), controller.signal);
        if (state.phase === 'done') deleteConversation(state.id);
      } catch (e: any) {
        if (!controller.signal.aborted) send('error', { message: e.message ?? 'The AI request failed.' });
      } finally {
        if (!controller.signal.aborted) {
          finished = true;
          send('done', {});
          reply.raw.end();
        }
      }
    }
  );

  // Materialize an approved plan into a real form. No AI call here — the plan
  // was already reviewed by the user, this just persists it.
  app.post<{ Body: FormPlan }>('/api/ai/create-form', {
    preHandler: requireAuth,
    schema: {
      summary: 'Persist an AI-drafted plan as a real form',
      description: 'No AI call here — just materializes an already-reviewed plan from plan-form\'s final `plan` event. Multiple steps become real steps; a single step is flattened.',
      body: {
        type: 'object',
        additionalProperties: true,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          steps: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        examples: [{
          title: 'Bakery Feedback',
          description: 'Tell us about your recent order',
          steps: [{
            title: 'Your Order',
            questions: [
              { type: 'text', label: 'What did you order?', required: true, options: [] },
              { type: 'multiple_choice', label: 'How would you rate the food quality?', required: true, options: ['Excellent', 'Good', 'Average', 'Poor'] },
            ],
          }],
        }],
      },
      response: {
        200: {
          description: 'The created (draft) form',
          type: 'object',
          additionalProperties: true,
          properties: { form: { type: 'object', additionalProperties: true } },
          examples: [{ form: { id: 'frm_9kLp3XqZ7Y', user_id: 'usr_8gT2mQliX9', title: 'Bakery Feedback', description: 'Tell us about your recent order', status: 'draft', slug: null, created_at: '2026-08-05T12:00:00.000Z', updated_at: '2026-08-05T12:00:00.000Z' } }],
        },
        400: {
          description: 'title or steps missing',
          type: 'object',
          additionalProperties: true,
          properties: { error: { type: 'string' } },
          examples: [{ error: 'title and steps are required' }],
        },
      },
    },
    config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const { title, description, steps } = req.body ?? {};
    if (!title || !Array.isArray(steps)) {
      return reply.status(400).send({ error: 'title and steps are required' });
    }

    const formId = nanoid();
    const useSteps = steps.length > 1;

    await db.transaction(async (tx) => {
      await tx.run(`INSERT INTO forms (id, user_id, title, description) VALUES (?, ?, ?, ?)`,
        [formId, req.userId, title, description ?? '']);

      let questionOrder = 0;
      for (const [stepIndex, step] of steps.entries()) {
        const stepId = useSteps ? nanoid() : null;
        if (useSteps && stepId) {
          await tx.run(`INSERT INTO steps (id, form_id, title, order_index) VALUES (?, ?, ?, ?)`,
            [stepId, formId, step.title ?? '', stepIndex]);
        }
        for (const q of step.questions ?? []) {
          await tx.run(`
            INSERT INTO questions (id, form_id, step_id, type, label, required, options, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [nanoid(), formId, stepId, q.type, q.label, q.required ? 1 : 0, JSON.stringify(q.options ?? []), questionOrder++]);
        }
      }
    });

    const form = await db.get(`SELECT * FROM forms WHERE id = ?`, [formId]);
    return { form };
  });
}
