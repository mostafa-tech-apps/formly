import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import * as db from './db.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export const SESSION_COOKIE = 'formly_session';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  return hashBuffer.length === derived.length && crypto.timingSafeEqual(hashBuffer, derived);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateApiToken(): string {
  return `formly_${nanoid(32)}`;
}

export async function createSession(userId: string): Promise<string> {
  const id = nanoid(32);
  await db.run(`INSERT INTO sessions (id, user_id) VALUES (?, ?)`, [id, userId]);
  return id;
}

export async function destroySession(sessionId: string) {
  await db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
}

// Resolves the caller's identity from either an Authorization: Bearer <api token>
// header (MCP / API clients) or the session cookie (browser dashboard), and sets
// req.userId. Sends 401 if neither is present/valid.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = await db.get<{ id: string }>(`SELECT id FROM users WHERE api_token_hash = ?`, [hashToken(token)]);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid API token' });
    }
    req.userId = user.id;
    return;
  }

  const sessionId = req.cookies[SESSION_COOKIE];
  const session = sessionId
    ? await db.get<{ user_id: string }>(`SELECT user_id FROM sessions WHERE id = ?`, [sessionId])
    : undefined;

  if (!session) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
  req.userId = session.user_id;
}
