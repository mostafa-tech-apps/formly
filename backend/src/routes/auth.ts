import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import * as db from '../db.js';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateApiToken,
  createSession,
  destroySession,
  requireAuth,
  SESSION_COOKIE,
} from '../auth.js';

interface AuthBody {
  email?: string;
  password?: string;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

const userExample = { id: 'usr_8gT2mQliX9', email: 'jane@example.com' };
const errorResponse = (description: string, example: string) => ({
  description,
  type: 'object' as const,
  additionalProperties: true,
  properties: { error: { type: 'string' } },
  examples: [{ error: example }],
});

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: AuthBody }>('/api/auth/signup', {
    schema: {
      summary: 'Create an account',
      description: 'Signs up a new user and sets the session cookie. Also usable unauthenticated.',
      body: {
        type: 'object',
        additionalProperties: true,
        properties: { email: { type: 'string' }, password: { type: 'string' } },
        examples: [{ email: 'jane@example.com', password: 'correct-horse-battery-staple' }],
      },
      response: {
        200: {
          description: 'Account created',
          type: 'object',
          additionalProperties: true,
          properties: { user: { type: 'object', additionalProperties: true } },
          examples: [{ user: userExample }],
        },
        400: errorResponse('Missing or invalid fields', 'Password must be at least 8 characters'),
        409: errorResponse('Email already in use', 'An account with this email already exists'),
      },
    },
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }

    const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing) {
      return reply.status(409).send({ error: 'An account with this email already exists' });
    }

    const id = nanoid();
    await db.run(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`, [id, email, hashPassword(password)]);

    const sessionId = await createSession(id);
    reply.setCookie(SESSION_COOKIE, sessionId, COOKIE_OPTIONS);
    return { user: { id, email } };
  });

  app.post<{ Body: AuthBody }>('/api/auth/login', {
    schema: {
      summary: 'Log in',
      description: 'Verifies credentials and sets the session cookie.',
      body: {
        type: 'object',
        additionalProperties: true,
        properties: { email: { type: 'string' }, password: { type: 'string' } },
        examples: [{ email: 'jane@example.com', password: 'correct-horse-battery-staple' }],
      },
      response: {
        200: {
          description: 'Logged in',
          type: 'object',
          additionalProperties: true,
          properties: { user: { type: 'object', additionalProperties: true } },
          examples: [{ user: userExample }],
        },
        401: errorResponse('Bad credentials', 'Invalid email or password'),
      },
    },
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const user = await db.get<{ id: string; email: string; password_hash: string }>(
      `SELECT id, email, password_hash FROM users WHERE email = ?`, [email]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const sessionId = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, sessionId, COOKIE_OPTIONS);
    return { user: { id: user.id, email: user.email } };
  });

  app.post('/api/auth/logout', {
    schema: {
      summary: 'Log out',
      description: 'Clears the session cookie.',
      response: {
        200: {
          description: 'Logged out',
          type: 'object',
          additionalProperties: true,
          properties: { success: { type: 'boolean' } },
          examples: [{ success: true }],
        },
      },
    },
  }, async (req, reply) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    if (sessionId) await destroySession(sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { success: true };
  });

  app.get('/api/auth/me', {
    preHandler: requireAuth,
    schema: {
      summary: 'Get the current user',
      description: 'Requires a session cookie or `Authorization: Bearer <api token>`.',
      response: {
        200: {
          description: 'The authenticated user',
          type: 'object',
          additionalProperties: true,
          properties: { user: { type: 'object', additionalProperties: true } },
          examples: [{ user: { ...userExample, hasApiToken: true } }],
        },
        401: errorResponse('No valid session or token', 'Unauthorized'),
      },
    },
  }, async (req) => {
    const user = await db.get<{ id: string; email: string; api_token_hash: string | null }>(
      `SELECT id, email, api_token_hash FROM users WHERE id = ?`, [req.userId]
    );
    return { user: { id: user!.id, email: user!.email, hasApiToken: !!user!.api_token_hash } };
  });

  // Generate (or replace) the caller's MCP API token. Shown once — only the hash is stored.
  app.post('/api/auth/token', {
    preHandler: requireAuth,
    schema: {
      summary: 'Generate an API token',
      description: 'Replaces any existing token. The returned value is shown only once — only its hash is stored, so save it now.',
      response: {
        200: {
          description: 'The new token',
          type: 'object',
          additionalProperties: true,
          properties: { token: { type: 'string' } },
          examples: [{ token: 'formly_AbCdEfGhIjKlMnOpQrStUvWxYz012345' }],
        },
      },
    },
  }, async (req) => {
    const token = generateApiToken();
    await db.run(`UPDATE users SET api_token_hash = ? WHERE id = ?`, [hashToken(token), req.userId]);
    return { token };
  });

  app.delete('/api/auth/token', {
    preHandler: requireAuth,
    schema: {
      summary: 'Revoke the API token',
      response: {
        200: {
          description: 'Token revoked',
          type: 'object',
          additionalProperties: true,
          properties: { success: { type: 'boolean' } },
          examples: [{ success: true }],
        },
      },
    },
  }, async (req) => {
    await db.run(`UPDATE users SET api_token_hash = NULL WHERE id = ?`, [req.userId]);
    return { success: true };
  });
}
