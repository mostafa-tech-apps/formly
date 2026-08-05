import { FastifyInstance } from 'fastify';
import db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';
import { askClaudeJSON } from '../ai.js';
import { runAgentTurn, type FormPlan } from '../agent.js';
import { createConversation, getConversation, deleteConversation, type ConversationState } from '../agentConversations.js';

export default async function aiRoutes(app: FastifyInstance) {
  // Rewrite a single question's label for clarity
  app.post<{ Body: { label?: string } }>('/api/ai/improve-question', { preHandler: requireAuth }, async (req, reply) => {
    const label = req.body?.label?.trim();
    if (!label) return reply.status(400).send({ error: 'label is required' });

    try {
      const result = await askClaudeJSON<{ label: string }>({
        system: 'You improve form question wording. Rewrite the given question label to be clearer and more concise while preserving its original intent, tone, and level of formality. Return only the rewritten label, nothing else.',
        prompt: label,
        schema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false },
        effort: 'low',
        maxTokens: 512,
      });
      return { label: result.label };
    } catch (e: any) {
      return reply.status(502).send({ error: e.message });
    }
  });

  // Suggest multiple-choice options for a question
  app.post<{ Body: { label?: string } }>('/api/ai/suggest-options', { preHandler: requireAuth }, async (req, reply) => {
    const label = req.body?.label?.trim();
    if (!label) return reply.status(400).send({ error: 'label is required' });

    try {
      const result = await askClaudeJSON<{ options: string[] }>({
        system: 'You suggest answer options for a multiple-choice form question. Given the question label, suggest 3 to 6 concise, mutually distinct options a respondent might choose. Cover the most likely real answers.',
        prompt: label,
        schema: { type: 'object', properties: { options: { type: 'array', items: { type: 'string' } } }, required: ['options'], additionalProperties: false },
        effort: 'low',
        maxTokens: 512,
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
    { preHandler: requireAuth },
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
  app.post<{ Body: FormPlan }>('/api/ai/create-form', { preHandler: requireAuth }, async (req, reply) => {
    const { title, description, steps } = req.body ?? {};
    if (!title || !Array.isArray(steps)) {
      return reply.status(400).send({ error: 'title and steps are required' });
    }

    const formId = nanoid();
    const useSteps = steps.length > 1;

    const create = db.transaction(() => {
      db.prepare(`INSERT INTO forms (id, user_id, title, description) VALUES (?, ?, ?, ?)`)
        .run(formId, req.userId, title, description ?? '');

      let questionOrder = 0;
      steps.forEach((step, stepIndex) => {
        const stepId = useSteps ? nanoid() : null;
        if (useSteps && stepId) {
          db.prepare(`INSERT INTO steps (id, form_id, title, order_index) VALUES (?, ?, ?, ?)`)
            .run(stepId, formId, step.title ?? '', stepIndex);
        }
        for (const q of step.questions ?? []) {
          db.prepare(`
            INSERT INTO questions (id, form_id, step_id, type, label, required, options, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(nanoid(), formId, stepId, q.type, q.label, q.required ? 1 : 0, JSON.stringify(q.options ?? []), questionOrder++);
        }
      });
    });
    create();

    const form = db.prepare(`SELECT * FROM forms WHERE id = ?`).get(formId);
    return { form };
  });
}
