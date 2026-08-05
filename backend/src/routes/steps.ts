import { FastifyInstance } from 'fastify';
import db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';

interface StepBody {
  title?: string;
}

interface ReorderBody {
  stepIds: string[];
}

function ownedForm(formId: string, userId: string | undefined) {
  return db.prepare(`SELECT id FROM forms WHERE id = ? AND user_id = ?`).get(formId, userId);
}

export default async function stepRoutes(app: FastifyInstance) {
  // Add a step to a form
  app.post<{ Params: { formId: string }; Body: StepBody }>(
    '/api/forms/:formId/steps',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!ownedForm(req.params.formId, req.userId)) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const id = nanoid();
      const { title = '' } = req.body ?? {};
      const maxOrder = db.prepare(
        `SELECT COALESCE(MAX(order_index), -1) as max_order FROM steps WHERE form_id = ?`
      ).get(req.params.formId) as { max_order: number };

      db.prepare(`INSERT INTO steps (id, form_id, title, order_index) VALUES (?, ?, ?, ?)`)
        .run(id, req.params.formId, title, maxOrder.max_order + 1);

      const step = db.prepare(`SELECT * FROM steps WHERE id = ?`).get(id);
      return { step };
    }
  );

  // Rename a step
  app.put<{ Params: { formId: string; stepId: string }; Body: StepBody }>(
    '/api/forms/:formId/steps/:stepId',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!ownedForm(req.params.formId, req.userId)) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      const { title } = req.body ?? {};
      const result = db.prepare(`UPDATE steps SET title = COALESCE(?, title) WHERE id = ? AND form_id = ?`)
        .run(title ?? null, req.params.stepId, req.params.formId);
      if (result.changes === 0) {
        return reply.status(404).send({ error: 'Step not found' });
      }
      const step = db.prepare(`SELECT * FROM steps WHERE id = ?`).get(req.params.stepId);
      return { step };
    }
  );

  // Delete a step. Its questions fall back to the nearest preceding step, or
  // become unassigned (step_id = NULL) if it was the first/only step.
  app.delete<{ Params: { formId: string; stepId: string } }>(
    '/api/forms/:formId/steps/:stepId',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!ownedForm(req.params.formId, req.userId)) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const step = db.prepare(`SELECT * FROM steps WHERE id = ? AND form_id = ?`)
        .get(req.params.stepId, req.params.formId) as { order_index: number } | undefined;
      if (!step) {
        return reply.status(404).send({ error: 'Step not found' });
      }

      const fallback = db.prepare(
        `SELECT id FROM steps WHERE form_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1`
      ).get(req.params.formId, step.order_index) as { id: string } | undefined;

      db.prepare(`UPDATE questions SET step_id = ? WHERE step_id = ?`)
        .run(fallback?.id ?? null, req.params.stepId);
      db.prepare(`DELETE FROM steps WHERE id = ?`).run(req.params.stepId);

      return { success: true };
    }
  );

  // Reorder steps
  app.put<{ Params: { formId: string }; Body: ReorderBody }>(
    '/api/forms/:formId/steps/reorder',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!ownedForm(req.params.formId, req.userId)) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      const { stepIds } = req.body;
      if (!Array.isArray(stepIds)) {
        return reply.status(400).send({ error: 'stepIds must be an array' });
      }

      const updateStmt = db.prepare(`UPDATE steps SET order_index = ? WHERE id = ? AND form_id = ?`);
      const reorderTransaction = db.transaction(() => {
        stepIds.forEach((id, index) => {
          updateStmt.run(index, id, req.params.formId);
        });
      });
      reorderTransaction();

      const steps = db.prepare(`SELECT * FROM steps WHERE form_id = ? ORDER BY order_index ASC`).all(req.params.formId);
      return { steps };
    }
  );
}
