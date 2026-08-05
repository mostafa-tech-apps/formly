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

export default async function formRoutes(app: FastifyInstance) {
  // List all forms owned by the caller
  app.get('/api/forms', { preHandler: requireAuth }, async (req) => {
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
  app.post('/api/forms', { preHandler: requireAuth }, async (req) => {
    const id = nanoid();
    await db.run(`INSERT INTO forms (id, user_id) VALUES (?, ?)`, [id, req.userId]);
    const form = await db.get(`SELECT * FROM forms WHERE id = ?`, [id]);
    return { form };
  });

  // Get a single form with questions (must be owned by the caller)
  app.get<{ Params: { id: string } }>('/api/forms/:id', { preHandler: requireAuth }, async (req, reply) => {
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
  app.put<{ Params: { id: string }; Body: FormBody }>('/api/forms/:id', { preHandler: requireAuth }, async (req, reply) => {
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
  app.delete<{ Params: { id: string } }>('/api/forms/:id', { preHandler: requireAuth }, async (req, reply) => {
    const result = await db.run(`DELETE FROM forms WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (result.changes === 0) {
      return reply.status(404).send({ error: 'Form not found' });
    }
    return { success: true };
  });

  // Get a published form by slug (public)
  app.get<{ Params: { slug: string } }>('/api/forms/public/:slug', async (req, reply) => {
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
