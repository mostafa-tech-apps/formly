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

export default async function questionRoutes(app: FastifyInstance) {
  // Add a question to a form
  app.post<{ Params: { formId: string }; Body: QuestionBody }>(
    '/api/forms/:formId/questions',
    { preHandler: requireAuth },
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
    { preHandler: requireAuth },
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
    { preHandler: requireAuth },
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
    { preHandler: requireAuth },
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
