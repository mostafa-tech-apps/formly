import { FastifyInstance } from 'fastify';
import db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';

interface QuestionBody {
  type?: 'text' | 'multiple_choice' | 'file_upload';
  label?: string;
  required?: boolean;
  options?: string[];
  visibility_rules?: any;
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
      const form = db.prepare(`SELECT * FROM forms WHERE id = ? AND user_id = ?`).get(req.params.formId, req.userId);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const id = nanoid();
      const { type = 'text', label = '', required = false, options = [], visibility_rules = null } = req.body;

      // Get next order index
      const maxOrder = db.prepare(
        `SELECT COALESCE(MAX(order_index), -1) as max_order FROM questions WHERE form_id = ?`
      ).get(req.params.formId) as { max_order: number };

      db.prepare(`
        INSERT INTO questions (id, form_id, type, label, required, options, order_index, visibility_rules)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, 
        req.params.formId, 
        type, 
        label, 
        required ? 1 : 0, 
        JSON.stringify(options), 
        maxOrder.max_order + 1,
        visibility_rules ? JSON.stringify(visibility_rules) : null
      );

      // Update form timestamp
      db.prepare(`UPDATE forms SET updated_at = datetime('now') WHERE id = ?`).run(req.params.formId);

      const question = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id);
      return { question };
    }
  );

  // Update a question
  app.put<{ Params: { formId: string; questionId: string }; Body: QuestionBody }>(
    '/api/forms/:formId/questions/:questionId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const form = db.prepare(`SELECT id FROM forms WHERE id = ? AND user_id = ?`).get(req.params.formId, req.userId);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      const question = db.prepare(
        `SELECT * FROM questions WHERE id = ? AND form_id = ?`
      ).get(req.params.questionId, req.params.formId);
      if (!question) {
        return reply.status(404).send({ error: 'Question not found' });
      }

      const { type, label, required, options, visibility_rules } = req.body;

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

      if (updates.length > 0) {
        params.push(req.params.questionId, req.params.formId);
        db.prepare(`
          UPDATE questions
          SET ${updates.join(', ')}
          WHERE id = ? AND form_id = ?
        `).run(...params);
      }

      // Update form timestamp
      db.prepare(`UPDATE forms SET updated_at = datetime('now') WHERE id = ?`).run(req.params.formId);

      const updated = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(req.params.questionId);
      return { question: updated };
    }
  );

  // Delete a question
  app.delete<{ Params: { formId: string; questionId: string } }>(
    '/api/forms/:formId/questions/:questionId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const form = db.prepare(`SELECT status FROM forms WHERE id = ? AND user_id = ?`).get(req.params.formId, req.userId) as { status: string } | undefined;
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      if (form.status === 'published') {
        const qCount = db.prepare(`SELECT COUNT(*) as count FROM questions WHERE form_id = ?`).get(req.params.formId) as { count: number };
        if (qCount.count <= 1) {
          return reply.status(400).send({ error: 'A published form must have at least one question. Change it to Draft first to remove all questions.' });
        }
      }

      const result = db.prepare(
        `DELETE FROM questions WHERE id = ? AND form_id = ?`
      ).run(req.params.questionId, req.params.formId);

      if (result.changes === 0) {
        return reply.status(404).send({ error: 'Question not found' });
      }

      // Re-index remaining questions
      const remaining = db.prepare(
        `SELECT id FROM questions WHERE form_id = ? ORDER BY order_index ASC`
      ).all(req.params.formId) as { id: string }[];

      const updateStmt = db.prepare(`UPDATE questions SET order_index = ? WHERE id = ?`);
      const reindexTransaction = db.transaction(() => {
        remaining.forEach((q, index) => {
          updateStmt.run(index, q.id);
        });
      });
      reindexTransaction();

      // Update form timestamp
      db.prepare(`UPDATE forms SET updated_at = datetime('now') WHERE id = ?`).run(req.params.formId);

      return { success: true };
    }
  );

  // Reorder questions
  app.put<{ Params: { formId: string }; Body: ReorderBody }>(
    '/api/forms/:formId/questions/reorder',
    { preHandler: requireAuth },
    async (req, reply) => {
      const form = db.prepare(`SELECT id FROM forms WHERE id = ? AND user_id = ?`).get(req.params.formId, req.userId);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const { questionIds } = req.body;
      if (!Array.isArray(questionIds)) {
        return reply.status(400).send({ error: 'questionIds must be an array' });
      }

      const updateStmt = db.prepare(`UPDATE questions SET order_index = ? WHERE id = ? AND form_id = ?`);
      const reorderTransaction = db.transaction(() => {
        questionIds.forEach((id, index) => {
          updateStmt.run(index, id, req.params.formId);
        });
      });
      reorderTransaction();

      // Update form timestamp
      db.prepare(`UPDATE forms SET updated_at = datetime('now') WHERE id = ?`).run(req.params.formId);

      const questions = db.prepare(
        `SELECT * FROM questions WHERE form_id = ? ORDER BY order_index ASC`
      ).all(req.params.formId);

      return { questions };
    }
  );
}
