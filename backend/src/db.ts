import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'formbuilder.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Form',
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
    slug TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('text', 'multiple_choice', 'file_upload')),
    label TEXT NOT NULL DEFAULT '',
    required INTEGER NOT NULL DEFAULT 0,
    options TEXT DEFAULT '[]',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    value TEXT DEFAULT '',
    file_path TEXT DEFAULT NULL,
    file_name TEXT DEFAULT NULL,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_questions_form_id ON questions(form_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON submissions(form_id);
  CREATE INDEX IF NOT EXISTS idx_answers_submission_id ON answers(submission_id);
  CREATE INDEX IF NOT EXISTS idx_forms_slug ON forms(slug);
`);

export default db;
