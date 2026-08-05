import { FastifyInstance } from 'fastify';
import db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';

interface FormBody {
  title?: string;
  description?: string;
  status?: 'draft' | 'published';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'form';
}

function uniqueSlug(base: string): string {
  return `${base}-${nanoid(6)}`;
}

export default async function formRoutes(app: FastifyInstance) {
  // List all forms owned by the caller
  app.get('/api/forms', { preHandler: requireAuth }, async (req) => {
    const forms = db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id) as submission_count,
        (SELECT COUNT(*) FROM questions q WHERE q.form_id = f.id) as question_count
      FROM forms f
      WHERE f.user_id = ?
      ORDER BY f.updated_at DESC
    `).all(req.userId);
    return { forms };
  });

  // Create a form owned by the caller
  app.post('/api/forms', { preHandler: requireAuth }, async (req) => {
    const id = nanoid();
    db.prepare(`INSERT INTO forms (id, user_id) VALUES (?, ?)`).run(id, req.userId);
    const form = db.prepare(`SELECT * FROM forms WHERE id = ?`).get(id);
    return { form };
  });

  // Get a single form with questions (must be owned by the caller)
  app.get<{ Params: { id: string } }>('/api/forms/:id', { preHandler: requireAuth }, async (req, reply) => {
    const form = db.prepare(`SELECT * FROM forms WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId);
    if (!form) {
      return reply.status(404).send({ error: 'Form not found' });
    }
    const questions = db.prepare(
      `SELECT * FROM questions WHERE form_id = ? ORDER BY order_index ASC`
    ).all(req.params.id);
    return { form, questions };
  });

  // Update a form (must be owned by the caller)
  app.put<{ Params: { id: string }; Body: FormBody }>('/api/forms/:id', { preHandler: requireAuth }, async (req, reply) => {
    const form = db.prepare(`SELECT * FROM forms WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId) as any;
    if (!form) {
      return reply.status(404).send({ error: 'Form not found' });
    }

    const { title, description, status } = req.body;
    let slug = form.slug;

    if (status === 'published') {
      const qCount = db.prepare(`SELECT COUNT(*) as count FROM questions WHERE form_id = ?`).get(req.params.id) as { count: number };
      if (qCount.count === 0) {
        return reply.status(400).send({ error: 'A form must have at least one question to be published.' });
      }
      // Generate slug from the form's title when publishing for the first time
      if (!form.slug) {
        slug = uniqueSlug(slugify(title ?? form.title));
      }
    }

    db.prepare(`
      UPDATE forms
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          slug = COALESCE(?, slug),
          updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(title ?? null, description ?? null, status ?? null, slug, req.params.id, req.userId);

    const updated = db.prepare(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id) as submission_count,
        (SELECT COUNT(*) FROM questions q WHERE q.form_id = f.id) as question_count
      FROM forms f WHERE f.id = ?
    `).get(req.params.id);
    return { form: updated };
  });

  // Delete a form (must be owned by the caller)
  app.delete<{ Params: { id: string } }>('/api/forms/:id', { preHandler: requireAuth }, async (req, reply) => {
    const result = db.prepare(`DELETE FROM forms WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId);
    if (result.changes === 0) {
      return reply.status(404).send({ error: 'Form not found' });
    }
    return { success: true };
  });

  // Get a published form by slug (public)
  app.get<{ Params: { slug: string } }>('/api/forms/public/:slug', async (req, reply) => {
    const form = db.prepare(
      `SELECT id, title, description, status, slug FROM forms WHERE slug = ? AND status = 'published'`
    ).get(req.params.slug);
    if (!form) {
      return reply.status(404).send({ error: 'Form not found or not published' });
    }
    const questions = db.prepare(
      `SELECT id, type, label, required, options, order_index FROM questions WHERE form_id = ? ORDER BY order_index ASC`
    ).all((form as any).id);
    return { form, questions };
  });
}
