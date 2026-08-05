import { FastifyInstance } from 'fastify';
import * as db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';

interface QuestionBody {
  type?: 'text' | 'multiple_choice' | 'file_upload';
  label?: string;
  required?: boolean;
  options?: string[];
  visibility_rules?: any;
  step_id?: string | null;
}

interface ReorderBody {
  questionIds: string[];
}

const textQuestionExample = {
  id: 'qst_7YbNc3RtLk', form_id: 'frm_9kLp3XqZ7Y', step_id: 'stp_4mZtR7vPq2',
  type: 'text', label: "What's your name?", required: 1, options: '[]', order_index: 0,
  visibility_rules: null, created_at: '2026-08-05T12:00:00.000Z',
};
const choiceQuestionExample = {
  id: 'qst_2XpQz9WmVh', form_id: 'frm_9kLp3XqZ7Y', step_id: 'stp_4mZtR7vPq2',
  type: 'multiple_choice', label: 'How did you hear about us?', required: 0,
  options: '["Social media","Friend or colleague","Search engine","Other"]', order_index: 1,
  visibility_rules: null, created_at: '2026-08-05T12:00:00.000Z',
};
const questionBodySchema = {
  type: 'object' as const,
  additionalProperties: true,
  properties: {
    type: { type: 'string', enum: ['text', 'multiple_choice', 'file_upload'] },
    label: { type: 'string' },
    required: { type: 'boolean' },
    options: { type: 'array', items: { type: 'string' } },
    visibility_rules: { type: 'object', additionalProperties: true, nullable: true },
    step_id: { type: 'string', nullable: true },
  },
};
const formNotFoundResponse = {
  description: 'Form not found',
  type: 'object' as const,
  additionalProperties: true,
  properties: { error: { type: 'string' } },
  examples: [{ error: 'Form not found' }],
};

export default async function questionRoutes(app: FastifyInstance) {
  // Add a question to a form
  app.post<{ Params: { formId: string }; Body: QuestionBody }>(
    '/api/forms/:formId/questions',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Add a question to a form',
        body: { ...questionBodySchema, examples: [{ type: 'multiple_choice', label: 'How did you hear about us?', required: false, options: ['Social media', 'Friend or colleague', 'Search engine', 'Other'] }] },
        response: {
          200: {
            description: 'The new question',
            type: 'object',
            additionalProperties: true,
            properties: { question: { type: 'object', additionalProperties: true } },
            examples: [{ question: choiceQuestionExample }],
          },
          404: formNotFoundResponse,
        },
      },
    },
    async (req, reply) => {
      const form = await db.get(`SELECT * FROM forms WHERE id = ? AND user_id = ?`, [req.params.formId, req.userId]);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const id = nanoid();
      const { type = 'text', label = '', required = false, options = [], visibility_rules = null, step_id = null } = req.body;

      // Get next order index
      const maxOrder = await db.get<{ max_order: number }>(
        `SELECT COALESCE(MAX(order_index), -1) as max_order FROM questions WHERE form_id = ?`, [req.params.formId]
      );

      await db.run(`
        INSERT INTO questions (id, form_id, type, label, required, options, order_index, visibility_rules, step_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        req.params.formId,
        type,
        label,
        required ? 1 : 0,
        JSON.stringify(options),
        maxOrder!.max_order + 1,
        visibility_rules ? JSON.stringify(visibility_rules) : null,
        step_id
      ]);

      // Update form timestamp
      await db.run(`UPDATE forms SET updated_at = now() WHERE id = ?`, [req.params.formId]);

      const question = await db.get(`SELECT * FROM questions WHERE id = ?`, [id]);
      return { question };
    }
  );

  // Update a question
  app.put<{ Params: { formId: string; questionId: string }; Body: QuestionBody }>(
    '/api/forms/:formId/questions/:questionId',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Update a question',
        description: 'Any field omitted is left unchanged.',
        body: { ...questionBodySchema, examples: [{ label: "What's your full name?", required: true }] },
        response: {
          200: {
            description: 'The updated question',
            type: 'object',
            additionalProperties: true,
            properties: { question: { type: 'object', additionalProperties: true } },
            examples: [{ question: textQuestionExample }],
          },
          404: {
            description: 'Form or question not found',
            type: 'object',
            additionalProperties: true,
            properties: { error: { type: 'string' } },
            examples: [{ error: 'Question not found' }],
          },
        },
      },
    },
    async (req, reply) => {
      const form = await db.get(`SELECT id FROM forms WHERE id = ? AND user_id = ?`, [req.params.formId, req.userId]);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      const question = await db.get(
        `SELECT * FROM questions WHERE id = ? AND form_id = ?`, [req.params.questionId, req.params.formId]
      );
      if (!question) {
        return reply.status(404).send({ error: 'Question not found' });
      }

      const { type, label, required, options, visibility_rules, step_id } = req.body;

      const updates: string[] = [];
      const params: any[] = [];

      if (type !== undefined) {
        updates.push('type = ?');
        params.push(type);
      }
      if (label !== undefined) {
        updates.push('label = ?');
        params.push(label);
      }
      if (required !== undefined) {
        updates.push('required = ?');
        params.push(required ? 1 : 0);
      }
      if (options !== undefined) {
        updates.push('options = ?');
        params.push(JSON.stringify(options));
      }
      if (visibility_rules !== undefined) {
        updates.push('visibility_rules = ?');
        params.push(visibility_rules === null ? null : JSON.stringify(visibility_rules));
      }
      if (step_id !== undefined) {
        updates.push('step_id = ?');
        params.push(step_id);
      }

      if (updates.length > 0) {
        params.push(req.params.questionId, req.params.formId);
        await db.run(`
          UPDATE questions
          SET ${updates.join(', ')}
          WHERE id = ? AND form_id = ?
        `, params);
      }

      // Update form timestamp
      await db.run(`UPDATE forms SET updated_at = now() WHERE id = ?`, [req.params.formId]);

      const updated = await db.get(`SELECT * FROM questions WHERE id = ?`, [req.params.questionId]);
      return { question: updated };
    }
  );

  // Delete a question
  app.delete<{ Params: { formId: string; questionId: string } }>(
    '/api/forms/:formId/questions/:questionId',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Delete a question',
        description: 'Blocked with 400 if this is the last question of an already-published form.',
        response: {
          200: {
            description: 'Deleted',
            type: 'object',
            additionalProperties: true,
            properties: { success: { type: 'boolean' } },
            examples: [{ success: true }],
          },
          400: {
            description: 'This is the last question of a published form',
            type: 'object',
            additionalProperties: true,
            properties: { error: { type: 'string' } },
            examples: [{ error: 'A published form must have at least one question. Change it to Draft first to remove all questions.' }],
          },
          404: formNotFoundResponse,
        },
      },
    },
    async (req, reply) => {
      const form = await db.get<{ status: string }>(`SELECT status FROM forms WHERE id = ? AND user_id = ?`, [req.params.formId, req.userId]);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      if (form.status === 'published') {
        const qCount = await db.get<{ count: number }>(`SELECT COUNT(*)::int as count FROM questions WHERE form_id = ?`, [req.params.formId]);
        if (qCount!.count <= 1) {
          return reply.status(400).send({ error: 'A published form must have at least one question. Change it to Draft first to remove all questions.' });
        }
      }

      const result = await db.run(
        `DELETE FROM questions WHERE id = ? AND form_id = ?`, [req.params.questionId, req.params.formId]
      );

      if (result.changes === 0) {
        return reply.status(404).send({ error: 'Question not found' });
      }

      // Re-index remaining questions
      const remaining = await db.all<{ id: string }>(
        `SELECT id FROM questions WHERE form_id = ? ORDER BY order_index ASC`, [req.params.formId]
      );

      await db.transaction(async (tx) => {
        for (const [index, q] of remaining.entries()) {
          await tx.run(`UPDATE questions SET order_index = ? WHERE id = ?`, [index, q.id]);
        }
      });

      // Update form timestamp
      await db.run(`UPDATE forms SET updated_at = now() WHERE id = ?`, [req.params.formId]);

      return { success: true };
    }
  );

  // Reorder questions
  app.put<{ Params: { formId: string }; Body: ReorderBody }>(
    '/api/forms/:formId/questions/reorder',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Reorder a form\'s questions',
        description: 'Full replacement — pass every question ID for the form, in the desired order.',
        body: {
          type: 'object',
          additionalProperties: true,
          properties: { questionIds: { type: 'array', items: { type: 'string' } } },
          examples: [{ questionIds: [choiceQuestionExample.id, textQuestionExample.id] }],
        },
        response: {
          200: {
            description: 'Questions in their new order',
            type: 'object',
            additionalProperties: true,
            properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: true } } },
            examples: [{ questions: [choiceQuestionExample, textQuestionExample] }],
          },
          404: formNotFoundResponse,
        },
      },
    },
    async (req, reply) => {
      const form = await db.get(`SELECT id FROM forms WHERE id = ? AND user_id = ?`, [req.params.formId, req.userId]);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const { questionIds } = req.body;
      if (!Array.isArray(questionIds)) {
        return reply.status(400).send({ error: 'questionIds must be an array' });
      }

      await db.transaction(async (tx) => {
        for (const [index, id] of questionIds.entries()) {
          await tx.run(`UPDATE questions SET order_index = ? WHERE id = ? AND form_id = ?`, [index, id, req.params.formId]);
        }
      });

      // Update form timestamp
      await db.run(`UPDATE forms SET updated_at = now() WHERE id = ?`, [req.params.formId]);

      const questions = await db.all(
        `SELECT * FROM questions WHERE form_id = ? ORDER BY order_index ASC`, [req.params.formId]
      );

      return { questions };
    }
  );
}
