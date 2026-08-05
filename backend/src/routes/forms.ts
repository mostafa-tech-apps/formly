import { FastifyInstance } from 'fastify';
import * as db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';
import { slugify, uniqueSlug } from '../slug.js';

interface FormBody {
  title?: string;
  description?: string;
  status?: 'draft' | 'published';
}

const formExample = {
  id: 'frm_9kLp3XqZ7Y',
  user_id: 'usr_8gT2mQliX9',
  title: 'Customer Feedback',
  description: 'Tell us about your experience with our product',
  status: 'published',
  slug: 'customer-feedback-9kzq',
  created_at: '2026-08-05T12:00:00.000Z',
  updated_at: '2026-08-05T12:00:00.000Z',
};
const formWithCounts = { ...formExample, submission_count: 12, question_count: 4 };
const stepExample = { id: 'stp_4mZtR7vPq2', form_id: 'frm_9kLp3XqZ7Y', title: 'Basic Info', order_index: 0, created_at: '2026-08-05T12:00:00.000Z' };
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
const notFoundResponse = {
  description: 'Form not found',
  type: 'object' as const,
  additionalProperties: true,
  properties: { error: { type: 'string' } },
  examples: [{ error: 'Form not found' }],
};

export default async function formRoutes(app: FastifyInstance) {
  // List all forms owned by the caller
  app.get('/api/forms', {
    preHandler: requireAuth,
    schema: {
      summary: 'List your forms',
      response: {
        200: {
          description: 'Forms owned by the caller, most recently updated first',
          type: 'object',
          additionalProperties: true,
          properties: { forms: { type: 'array', items: { type: 'object', additionalProperties: true } } },
          examples: [{ forms: [formWithCounts] }],
        },
      },
    },
  }, async (req) => {
    const forms = await db.all(`
      SELECT f.*,
        (SELECT COUNT(*)::int FROM submissions s WHERE s.form_id = f.id) as submission_count,
        (SELECT COUNT(*)::int FROM questions q WHERE q.form_id = f.id) as question_count
      FROM forms f
      WHERE f.user_id = ?
      ORDER BY f.updated_at DESC
    `, [req.userId]);
    return { forms };
  });

  // Create a form owned by the caller
  app.post('/api/forms', {
    preHandler: requireAuth,
    schema: {
      summary: 'Create a form',
      description: 'Creates an empty draft form titled "Untitled Form" — use PUT to set a title/description.',
      response: {
        200: {
          description: 'The new form',
          type: 'object',
          additionalProperties: true,
          properties: { form: { type: 'object', additionalProperties: true } },
          examples: [{ form: { ...formExample, title: 'Untitled Form', description: '', status: 'draft', slug: null } }],
        },
      },
    },
  }, async (req) => {
    const id = nanoid();
    await db.run(`INSERT INTO forms (id, user_id) VALUES (?, ?)`, [id, req.userId]);
    const form = await db.get(`SELECT * FROM forms WHERE id = ?`, [id]);
    return { form };
  });

  // Get a single form with questions (must be owned by the caller)
  app.get<{ Params: { id: string } }>('/api/forms/:id', {
    preHandler: requireAuth,
    schema: {
      summary: 'Get a form, with its questions and steps',
      response: {
        200: {
          description: 'The form plus its questions and steps',
          type: 'object',
          additionalProperties: true,
          properties: {
            form: { type: 'object', additionalProperties: true },
            questions: { type: 'array', items: { type: 'object', additionalProperties: true } },
            steps: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
          examples: [{ form: formExample, questions: [textQuestionExample, choiceQuestionExample], steps: [stepExample] }],
        },
        404: notFoundResponse,
      },
    },
  }, async (req, reply) => {
    const form = await db.get(`SELECT * FROM forms WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!form) {
      return reply.status(404).send({ error: 'Form not found' });
    }
    const questions = await db.all(
      `SELECT * FROM questions WHERE form_id = ? ORDER BY order_index ASC`, [req.params.id]
    );
    const steps = await db.all(
      `SELECT * FROM steps WHERE form_id = ? ORDER BY order_index ASC`, [req.params.id]
    );
    return { form, questions, steps };
  });

  // Update a form (must be owned by the caller)
  app.put<{ Params: { id: string }; Body: FormBody }>('/api/forms/:id', {
    preHandler: requireAuth,
    schema: {
      summary: 'Update a form',
      description: 'Any field omitted is left unchanged. Setting status to "published" for the first time generates its public slug — requires at least one question.',
      body: {
        type: 'object',
        additionalProperties: true,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published'] },
        },
        examples: [{ title: 'Customer Feedback', description: 'Tell us about your experience', status: 'published' }],
      },
      response: {
        200: {
          description: 'The updated form',
          type: 'object',
          additionalProperties: true,
          properties: { form: { type: 'object', additionalProperties: true } },
          examples: [{ form: formWithCounts }],
        },
        400: {
          description: 'Cannot publish a form with no questions',
          type: 'object',
          additionalProperties: true,
          properties: { error: { type: 'string' } },
          examples: [{ error: 'A form must have at least one question to be published.' }],
        },
        404: notFoundResponse,
      },
    },
  }, async (req, reply) => {
    const form = await db.get(`SELECT * FROM forms WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]) as any;
    if (!form) {
      return reply.status(404).send({ error: 'Form not found' });
    }

    const { title, description, status } = req.body;
    let slug = form.slug;

    if (status === 'published') {
      const qCount = await db.get<{ count: number }>(`SELECT COUNT(*)::int as count FROM questions WHERE form_id = ?`, [req.params.id]);
      if (qCount!.count === 0) {
        return reply.status(400).send({ error: 'A form must have at least one question to be published.' });
      }
      // Generate slug from the form's title when publishing for the first time
      if (!form.slug) {
        slug = uniqueSlug(slugify(title ?? form.title));
      }
    }

    await db.run(`
      UPDATE forms
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          slug = COALESCE(?, slug),
          updated_at = now()
      WHERE id = ? AND user_id = ?
    `, [title ?? null, description ?? null, status ?? null, slug, req.params.id, req.userId]);

    const updated = await db.get(`
      SELECT f.*,
        (SELECT COUNT(*)::int FROM submissions s WHERE s.form_id = f.id) as submission_count,
        (SELECT COUNT(*)::int FROM questions q WHERE q.form_id = f.id) as question_count
      FROM forms f WHERE f.id = ?
    `, [req.params.id]);
    return { form: updated };
  });

  // Delete a form (must be owned by the caller)
  app.delete<{ Params: { id: string } }>('/api/forms/:id', {
    preHandler: requireAuth,
    schema: {
      summary: 'Delete a form',
      description: 'Cascades to its questions, steps, and submissions.',
      response: {
        200: {
          description: 'Deleted',
          type: 'object',
          additionalProperties: true,
          properties: { success: { type: 'boolean' } },
          examples: [{ success: true }],
        },
        404: notFoundResponse,
      },
    },
  }, async (req, reply) => {
    const result = await db.run(`DELETE FROM forms WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (result.changes === 0) {
      return reply.status(404).send({ error: 'Form not found' });
    }
    return { success: true };
  });

  // Get a published form by slug (public)
  app.get<{ Params: { slug: string } }>('/api/forms/public/:slug', {
    schema: {
      summary: "Get a published form by its slug (no auth)",
      description: 'What the public fill-out page fetches. 404s if the slug is unknown or the form is a draft.',
      response: {
        200: {
          description: 'The published form plus its questions and steps',
          type: 'object',
          additionalProperties: true,
          properties: {
            form: { type: 'object', additionalProperties: true },
            questions: { type: 'array', items: { type: 'object', additionalProperties: true } },
            steps: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
          examples: [{
            form: { id: formExample.id, title: formExample.title, description: formExample.description, status: 'published', slug: formExample.slug },
            questions: [textQuestionExample, choiceQuestionExample],
            steps: [stepExample],
          }],
        },
        404: {
          description: 'Unknown slug or the form is unpublished',
          type: 'object',
          additionalProperties: true,
          properties: { error: { type: 'string' } },
          examples: [{ error: 'Form not found or not published' }],
        },
      },
    },
  }, async (req, reply) => {
    const form = await db.get(
      `SELECT id, title, description, status, slug FROM forms WHERE slug = ? AND status = 'published'`, [req.params.slug]
    );
    if (!form) {
      return reply.status(404).send({ error: 'Form not found or not published' });
    }
    const questions = await db.all(
      `SELECT id, type, label, required, options, order_index, step_id, visibility_rules FROM questions WHERE form_id = ? ORDER BY order_index ASC`,
      [(form as any).id]
    );
    const steps = await db.all(
      `SELECT id, title, order_index FROM steps WHERE form_id = ? ORDER BY order_index ASC`, [(form as any).id]
    );
    return { form, questions, steps };
  });
}
