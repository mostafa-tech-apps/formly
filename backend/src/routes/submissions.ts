import { FastifyInstance } from 'fastify';
import * as db from '../db.js';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ensure uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export default async function submissionRoutes(app: FastifyInstance) {
  // Submit a form (public, multipart)
  app.post<{ Params: { slug: string } }>(
    '/api/forms/public/:slug/submit',
    async (req, reply) => {
      const form = await db.get(
        `SELECT * FROM forms WHERE slug = ? AND status = 'published'`, [req.params.slug]
      ) as any;

      if (!form) {
        return reply.status(404).send({ error: 'Form not found or not published' });
      }

      const questions = await db.all(
        `SELECT * FROM questions WHERE form_id = ? ORDER BY order_index ASC`, [form.id]
      ) as any[];

      const submissionId = nanoid();
      const answersToInsert: { id: string; questionId: string; value: string; filePath: string | null; fileName: string | null }[] = [];

      // Parse multipart data
      const parts = req.parts();
      const fieldValues: Record<string, string> = {};
      const fileUploads: Record<string, { filePath: string; fileName: string }> = {};

      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.filename) {
            const fileId = nanoid();
            const ext = path.extname(part.filename);
            const savedName = `${fileId}${ext}`;
            const savePath = path.join(UPLOADS_DIR, savedName);

            await pipeline(part.file, fs.createWriteStream(savePath));

            // The field name is the question ID
            fileUploads[part.fieldname] = {
              filePath: savedName,
              fileName: part.filename
            };
          }
        } else {
          fieldValues[part.fieldname] = part.value as string;
        }
      }

      // Validate required fields
      for (const question of questions) {
        if (question.required) {
          const hasTextValue = fieldValues[question.id] && fieldValues[question.id].trim() !== '';
          const hasFileValue = fileUploads[question.id];

          if (question.type === 'file_upload' && !hasFileValue) {
            return reply.status(400).send({
              error: `Question "${question.label}" is required`,
              questionId: question.id
            });
          }
          if (question.type !== 'file_upload' && !hasTextValue) {
            return reply.status(400).send({
              error: `Question "${question.label}" is required`,
              questionId: question.id
            });
          }
        }
      }

      // Build answers
      for (const question of questions) {
        const answerId = nanoid();
        if (question.type === 'file_upload') {
          const upload = fileUploads[question.id];
          answersToInsert.push({
            id: answerId,
            questionId: question.id,
            value: '',
            filePath: upload?.filePath ?? null,
            fileName: upload?.fileName ?? null
          });
        } else {
          answersToInsert.push({
            id: answerId,
            questionId: question.id,
            value: fieldValues[question.id] ?? '',
            filePath: null,
            fileName: null
          });
        }
      }

      // Insert submission and answers in a transaction
      await db.transaction(async (tx) => {
        await tx.run(`INSERT INTO submissions (id, form_id) VALUES (?, ?)`, [submissionId, form.id]);
        for (const answer of answersToInsert) {
          await tx.run(
            `INSERT INTO answers (id, submission_id, question_id, value, file_path, file_name) VALUES (?, ?, ?, ?, ?, ?)`,
            [answer.id, submissionId, answer.questionId, answer.value, answer.filePath, answer.fileName]
          );
        }
      });

      return { success: true, submissionId };
    }
  );

  // List submissions for a form
  app.get<{ Params: { id: string } }>(
    '/api/forms/:id/submissions',
    { preHandler: requireAuth },
    async (req, reply) => {
      const form = await db.get(`SELECT * FROM forms WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const submissions = await db.all(`
        SELECT s.*,
          (SELECT COUNT(*)::int FROM answers a WHERE a.submission_id = s.id) as answer_count
        FROM submissions s
        WHERE s.form_id = ?
        ORDER BY s.submitted_at DESC
      `, [req.params.id]);

      // Get a preview of answers for each submission
      const getAnswersPreview = (submissionId: string) => db.all(`
        SELECT a.value, a.file_name, q.label, q.type
        FROM answers a
        JOIN questions q ON a.question_id = q.id
        WHERE a.submission_id = ?
        ORDER BY q.order_index ASC
        LIMIT 3
      `, [submissionId]);

      const submissionsWithPreview = await Promise.all((submissions as any[]).map(async sub => ({
        ...sub,
        preview: await getAnswersPreview(sub.id)
      })));

      return { submissions: submissionsWithPreview };
    }
  );

  // Get a single submission with all answers
  app.get<{ Params: { id: string; submissionId: string } }>(
    '/api/forms/:id/submissions/:submissionId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const form = await db.get(`SELECT id FROM forms WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const submission = await db.get(
        `SELECT * FROM submissions WHERE id = ? AND form_id = ?`, [req.params.submissionId, req.params.id]
      );

      if (!submission) {
        return reply.status(404).send({ error: 'Submission not found' });
      }

      const answers = await db.all(`
        SELECT a.*, q.label as question_label, q.type as question_type, q.options as question_options
        FROM answers a
        JOIN questions q ON a.question_id = q.id
        WHERE a.submission_id = ?
        ORDER BY q.order_index ASC
      `, [req.params.submissionId]);

      return { submission, answers };
    }
  );
}
