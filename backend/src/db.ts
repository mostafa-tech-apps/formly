import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// better-sqlite3-style `?` placeholders -> Postgres's `$1, $2, ...`
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const { rows } = await pool.query(toPositional(sql), params);
  return rows;
}

export async function get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}

export async function run(sql: string, params: any[] = []): Promise<{ changes: number }> {
  const res = await pool.query(toPositional(sql), params);
  return { changes: res.rowCount ?? 0 };
}

interface TxQueries {
  all: typeof all;
  get: typeof get;
  run: typeof run;
}

// Runs `fn` against a single client inside BEGIN/COMMIT, rolling back on error.
export async function transaction<T>(fn: (tx: TxQueries) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const tx: TxQueries = {
    all: async (sql, params = []) => (await client.query(toPositional(sql), params)).rows,
    get: async (sql, params = []) => (await client.query(toPositional(sql), params)).rows[0],
    run: async (sql, params = []) => {
      const res = await client.query(toPositional(sql), params);
      return { changes: res.rowCount ?? 0 };
    },
  };
  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    api_token_hash TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Form',
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
    slug TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS steps (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    step_id TEXT DEFAULT NULL REFERENCES steps(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('text', 'multiple_choice', 'file_upload')),
    label TEXT NOT NULL DEFAULT '',
    required INTEGER NOT NULL DEFAULT 0,
    options TEXT DEFAULT '[]',
    order_index INTEGER NOT NULL DEFAULT 0,
    visibility_rules TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    value TEXT DEFAULT '',
    file_path TEXT DEFAULT NULL,
    file_name TEXT DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_questions_form_id ON questions(form_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON submissions(form_id);
  CREATE INDEX IF NOT EXISTS idx_answers_submission_id ON answers(submission_id);
  CREATE INDEX IF NOT EXISTS idx_forms_slug ON forms(slug);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_steps_form_id ON steps(form_id);
  CREATE INDEX IF NOT EXISTS idx_forms_user_id ON forms(user_id);
  CREATE INDEX IF NOT EXISTS idx_questions_step_id ON questions(step_id);
`);
