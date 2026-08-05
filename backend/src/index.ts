import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import formRoutes from './routes/forms.js';
import questionRoutes from './routes/questions.js';
import stepRoutes from './routes/steps.js';
import submissionRoutes from './routes/submissions.js';
import mcpRoutes from './routes/mcp.js';
import aiRoutes from './routes/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  trustProxy: true, // needed for accurate req.ip-based rate limiting behind Render's proxy
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' }
    }
  }
});

// Register plugins
await app.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://formly-ruby-eight.vercel.app'],
  credentials: true
});

await app.register(cookie);

// Global baseline — generous, just anti-abuse. Individual routes (esp. the
// AI ones, which cost real tokens) set their own tighter limits below.
await app.register(rateLimit, {
  max: 300,
  timeWindow: '5 minutes',
});

await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10
  }
});

await app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'uploads'),
  prefix: '/uploads/',
  decorateReply: false
});

// Register routes
await app.register(authRoutes);
await app.register(formRoutes);
await app.register(questionRoutes);
await app.register(stepRoutes);
await app.register(submissionRoutes);
await app.register(mcpRoutes);
await app.register(aiRoutes);

// Health checks
app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/healthz', async () => ({ status: 'ok' }));

// Start server
const start = async () => {
  try {
    await app.listen({ port: 3001, host: '0.0.0.0' });
    console.log('\n🚀 Form Builder API running at http://localhost:3001\n');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
