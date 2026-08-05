import { FastifyInstance } from 'fastify';
import db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';
import { askClaudeJSON } from '../ai.js';

interface PlannedQuestion {
  type: 'text' | 'multiple_choice' | 'file_upload';
  label: string;
  required: boolean;
  options: string[];
}

interface PlannedStep {
  title: string;
  questions: PlannedQuestion[];
}

interface FormPlan {
  title: string;
  description: string;
  steps: PlannedStep[];
}

const questionSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['text', 'multiple_choice', 'file_upload'] },
    label: { type: 'string' },
    required: { type: 'boolean' },
    options: { type: 'array', items: { type: 'string' } },
  },
  required: ['type', 'label', 'required', 'options'],
  additionalProperties: false,
};

const formPlanSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          questions: { type: 'array', items: questionSchema },
        },
        required: ['title', 'questions'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'description', 'steps'],
  additionalProperties: false,
};

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

  // Draft a full form structure from a prompt. Read-only — nothing is persisted
  // until the caller reviews the plan and calls create-form.
  app.post<{ Body: { prompt?: string } }>('/api/ai/plan-form', { preHandler: requireAuth }, async (req, reply) => {
    const prompt = req.body?.prompt?.trim();
    if (!prompt) return reply.status(400).send({ error: 'prompt is required' });

    try {
      const plan = await askClaudeJSON<FormPlan>({
        system: 'You are a form-design assistant. Given a description of a form, design its structure: a concise title, a one-sentence description, and the full set of questions.\n\n' +
          'If the form covers several distinct topics or would end up long, split it into multiple logical steps (e.g. "Basic Info", "Preferences", "Payment"), each with a short title and 2-6 questions, ordered the way a respondent would naturally want to answer them. If the form is small and focused on one topic, use a single step.\n\n' +
          'Use "text" for open-ended answers, "multiple_choice" for a fixed set of choices (provide 2-6 options for these), and "file_upload" for file, document, or image submissions. Only mark a question required when skipping it would make the response unusable.',
        prompt,
        schema: formPlanSchema,
        effort: 'medium',
        maxTokens: 8192,
      });
      return { plan };
    } catch (e: any) {
      return reply.status(502).send({ error: e.message });
    }
  });

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
