import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

import formRoutes from './routes/forms.js';
import questionRoutes from './routes/questions.js';
import submissionRoutes from './routes/submissions.js';
import mcpRoutes from './routes/mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
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
await app.register(formRoutes);
await app.register(questionRoutes);
await app.register(submissionRoutes);
await app.register(mcpRoutes);

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
