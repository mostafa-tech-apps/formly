import { FastifyInstance } from 'fastify';
import * as db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';

interface StepBody {
  title?: string;
}

interface ReorderBody {
  stepIds: string[];
}

function ownedForm(formId: string, userId: string | undefined) {
  return db.get(`SELECT id FROM forms WHERE id = ? AND user_id = ?`, [formId, userId]);
}

const stepExample = { id: 'stp_4mZtR7vPq2', form_id: 'frm_9kLp3XqZ7Y', title: 'Basic Info', order_index: 0, created_at: '2026-08-05T12:00:00.000Z' };
const secondStepExample = { id: 'stp_6qWnJ2LxTb', form_id: 'frm_9kLp3XqZ7Y', title: 'Feedback', order_index: 1, created_at: '2026-08-05T12:05:00.000Z' };
const formNotFoundResponse = {
  description: 'Form not found',
  type: 'object' as const,
  additionalProperties: true,
  properties: { error: { type: 'string' } },
  examples: [{ error: 'Form not found' }],
};

export default async function stepRoutes(app: FastifyInstance) {
  // Add a step to a form
  app.post<{ Params: { formId: string }; Body: StepBody }>(
    '/api/forms/:formId/steps',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Add a step to a form',
        body: {
          type: 'object',
          additionalProperties: true,
          properties: { title: { type: 'string' } },
          examples: [{ title: 'Feedback' }],
        },
        response: {
          200: {
            description: 'The new step',
            type: 'object',
            additionalProperties: true,
            properties: { step: { type: 'object', additionalProperties: true } },
            examples: [{ step: secondStepExample }],
          },
          404: formNotFoundResponse,
        },
      },
    },
    async (req, reply) => {
      if (!(await ownedForm(req.params.formId, req.userId))) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const id = nanoid();
      const { title = '' } = req.body ?? {};
      const maxOrder = await db.get<{ max_order: number }>(
        `SELECT COALESCE(MAX(order_index), -1) as max_order FROM steps WHERE form_id = ?`, [req.params.formId]
      );

      await db.run(`INSERT INTO steps (id, form_id, title, order_index) VALUES (?, ?, ?, ?)`,
        [id, req.params.formId, title, maxOrder!.max_order + 1]);

      const step = await db.get(`SELECT * FROM steps WHERE id = ?`, [id]);
      return { step };
    }
  );

  // Rename a step
  app.put<{ Params: { formId: string; stepId: string }; Body: StepBody }>(
    '/api/forms/:formId/steps/:stepId',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Rename a step',
        body: {
          type: 'object',
          additionalProperties: true,
          properties: { title: { type: 'string' } },
          examples: [{ title: 'Basic Info' }],
        },
        response: {
          200: {
            description: 'The updated step',
            type: 'object',
            additionalProperties: true,
            properties: { step: { type: 'object', additionalProperties: true } },
            examples: [{ step: stepExample }],
          },
          404: {
            description: 'Form or step not found',
            type: 'object',
            additionalProperties: true,
            properties: { error: { type: 'string' } },
            examples: [{ error: 'Step not found' }],
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ownedForm(req.params.formId, req.userId))) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      const { title } = req.body ?? {};
      const result = await db.run(`UPDATE steps SET title = COALESCE(?, title) WHERE id = ? AND form_id = ?`,
        [title ?? null, req.params.stepId, req.params.formId]);
      if (result.changes === 0) {
        return reply.status(404).send({ error: 'Step not found' });
      }
      const step = await db.get(`SELECT * FROM steps WHERE id = ?`, [req.params.stepId]);
      return { step };
    }
  );

  // Delete a step. Its questions fall back to the nearest preceding step, or
  // become unassigned (step_id = NULL) if it was the first/only step.
  app.delete<{ Params: { formId: string; stepId: string } }>(
    '/api/forms/:formId/steps/:stepId',
    {
      preHandler: requireAuth,
      schema: {
        summary: 'Delete a step',
        description: "Its questions fall back to the nearest preceding step, or become unassigned if it was the first/only step.",
        response: {
          200: {
            description: 'Deleted',
            type: 'object',
            additionalProperties: true,
            properties: { success: { type: 'boolean' } },
            examples: [{ success: true }],
          },
          404: {
            description: 'Form or step not found',
            type: 'object',
            additionalProperties: true,
            properties: { error: { type: 'string' } },
            examples: [{ error: 'Step not found' }],
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ownedForm(req.params.formId, req.userId))) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const step = await db.get<{ order_index: number }>(`SELECT * FROM steps WHERE id = ? AND form_id = ?`,
        [req.params.stepId, req.params.formId]);
      if (!step) {
        return reply.status(404).send({ error: 'Step not found' });
      }

      const fallback = await db.get<{ id: string }>(
        `SELECT id FROM steps WHERE form_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1`,
        [req.params.formId, step.order_index]
      );

      await db.run(`UPDATE questions SET step_id = ? WHERE step_id = ?`,
        [fallback?.id ?? null, req.params.stepId]);
      await db.run(`DELETE FROM steps WHERE id = ?`, [req.params.stepId]);

      return { success: true };
    }
  );

  // Reorder steps
  app.put<{ Params: { formId: string }; Body: ReorderBody }>(
    '/api/forms/:formId/steps/reorder',
    {
      preHandler: requireAuth,
      schema: {
        summary: "Reorder a form's steps",
        description: 'Full replacement — pass every step ID for the form, in the desired order.',
        body: {
          type: 'object',
          additionalProperties: true,
          properties: { stepIds: { type: 'array', items: { type: 'string' } } },
          examples: [{ stepIds: [stepExample.id, secondStepExample.id] }],
        },
        response: {
          200: {
            description: 'Steps in their new order',
            type: 'object',
            additionalProperties: true,
            properties: { steps: { type: 'array', items: { type: 'object', additionalProperties: true } } },
            examples: [{ steps: [stepExample, secondStepExample] }],
          },
          404: formNotFoundResponse,
        },
      },
    },
    async (req, reply) => {
      if (!(await ownedForm(req.params.formId, req.userId))) {
        return reply.status(404).send({ error: 'Form not found' });
      }
      const { stepIds } = req.body;
      if (!Array.isArray(stepIds)) {
        return reply.status(400).send({ error: 'stepIds must be an array' });
      }

      await db.transaction(async (tx) => {
        for (const [index, id] of stepIds.entries()) {
          await tx.run(`UPDATE steps SET order_index = ? WHERE id = ? AND form_id = ?`, [index, id, req.params.formId]);
        }
      });

      const steps = await db.all(`SELECT * FROM steps WHERE form_id = ? ORDER BY order_index ASC`, [req.params.formId]);
      return { steps };
    }
  );
}
