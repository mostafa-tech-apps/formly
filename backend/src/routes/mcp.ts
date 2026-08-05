import { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const questionType = z.enum(['text', 'multiple_choice', 'file_upload']);
const formStatus = z.enum(['draft', 'published']);

function buildMcpServer(app: FastifyInstance, apiToken: string) {
  const server = new McpServer({ name: 'formly', version: '1.0.0' });

  function textResult(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }

  async function call(method: string, url: string, payload?: Record<string, unknown>) {
    const res = await app.inject({
      method: method as any,
      url,
      payload,
      headers: { authorization: `Bearer ${apiToken}` },
    });
    const data = res.json();
    if (res.statusCode >= 400) {
      throw new Error((data as any)?.error ?? `Request failed with status ${res.statusCode}`);
    }
    return data;
  }

  function tool<Args>(handler: (args: Args) => Promise<unknown>) {
    return async (args: Args) => {
      try {
        return textResult(await handler(args));
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
      }
    };
  }

  server.tool(
    'list_forms',
    'List all forms with their status, question count, and submission count.',
    {},
    tool(async () => call('GET', '/api/forms'))
  );

  server.tool(
    'get_form',
    'Get a single form by id, including its full question list and steps (for multi-step forms).',
    { formId: z.string().describe('The form id') },
    tool(async ({ formId }: { formId: string }) => call('GET', `/api/forms/${formId}`))
  );

  server.tool(
    'create_form',
    'Create a new form. Optionally set its title, description, and status in the same call. ' +
      'A form can only be published once it has at least one question, so create it as a draft ' +
      'first if you plan to add questions afterward, then publish with update_form.',
    {
      title: z.string().optional(),
      description: z.string().optional(),
      status: formStatus.optional(),
    },
    tool(async ({ title, description, status }: { title?: string; description?: string; status?: 'draft' | 'published' }) => {
      const { form } = (await call('POST', '/api/forms')) as { form: any };
      if (title !== undefined || description !== undefined || status !== undefined) {
        return call('PUT', `/api/forms/${form.id}`, { title, description, status });
      }
      return { form };
    })
  );

  server.tool(
    'update_form',
    'Update a form\'s title, description, or status. Set status to "published" to publish it ' +
      '(requires at least one question already added). Only the fields you provide are changed.',
    {
      formId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: formStatus.optional(),
    },
    tool(async ({ formId, ...body }: { formId: string; title?: string; description?: string; status?: 'draft' | 'published' }) =>
      call('PUT', `/api/forms/${formId}`, body)
    )
  );

  server.tool(
    'delete_form',
    'Permanently delete a form and all of its questions and submissions.',
    { formId: z.string() },
    tool(async ({ formId }: { formId: string }) => call('DELETE', `/api/forms/${formId}`))
  );

  server.tool(
    'add_question',
    'Add a question to a form. The "options" field is only used for multiple_choice questions. ' +
      'Pass stepId to place it in a specific step of a multi-step form; omit it to leave the question unassigned.',
    {
      formId: z.string(),
      type: questionType,
      label: z.string(),
      required: z.boolean().optional(),
      options: z.array(z.string()).optional().describe('Choice labels, for multiple_choice questions only'),
      stepId: z.string().optional().describe('The step this question belongs to, from get_form\'s steps list'),
    },
    tool(async ({ formId, stepId, ...body }: { formId: string; type: string; label: string; required?: boolean; options?: string[]; stepId?: string }) =>
      call('POST', `/api/forms/${formId}/questions`, { ...body, step_id: stepId })
    )
  );

  server.tool(
    'update_question',
    'Update an existing question\'s type, label, required flag, options, or step assignment.',
    {
      formId: z.string(),
      questionId: z.string(),
      type: questionType.optional(),
      label: z.string().optional(),
      required: z.boolean().optional(),
      options: z.array(z.string()).optional(),
      stepId: z.string().nullable().optional().describe('Move the question to this step, or null to unassign it'),
    },
    tool(async ({ formId, questionId, stepId, ...body }: { formId: string; questionId: string; type?: string; label?: string; required?: boolean; options?: string[]; stepId?: string | null }) =>
      call('PUT', `/api/forms/${formId}/questions/${questionId}`, stepId !== undefined ? { ...body, step_id: stepId } : body)
    )
  );

  server.tool(
    'delete_question',
    'Delete a question from a form. A published form must keep at least one question.',
    { formId: z.string(), questionId: z.string() },
    tool(async ({ formId, questionId }: { formId: string; questionId: string }) =>
      call('DELETE', `/api/forms/${formId}/questions/${questionId}`)
    )
  );

  server.tool(
    'reorder_questions',
    'Set the display order of a form\'s questions by passing all question ids in the desired order.',
    { formId: z.string(), questionIds: z.array(z.string()) },
    tool(async ({ formId, questionIds }: { formId: string; questionIds: string[] }) =>
      call('PUT', `/api/forms/${formId}/questions/reorder`, { questionIds })
    )
  );

  server.tool(
    'add_step',
    'Add a step (page) to a form, for multi-step forms. Steps display in the order they are created; use reorder_steps to change that.',
    { formId: z.string(), title: z.string().optional() },
    tool(async ({ formId, title }: { formId: string; title?: string }) => call('POST', `/api/forms/${formId}/steps`, { title }))
  );

  server.tool(
    'update_step',
    'Rename a step.',
    { formId: z.string(), stepId: z.string(), title: z.string() },
    tool(async ({ formId, stepId, title }: { formId: string; stepId: string; title: string }) =>
      call('PUT', `/api/forms/${formId}/steps/${stepId}`, { title })
    )
  );

  server.tool(
    'delete_step',
    'Delete a step. Its questions fall back to the nearest preceding step, or become unassigned if it was the first/only step.',
    { formId: z.string(), stepId: z.string() },
    tool(async ({ formId, stepId }: { formId: string; stepId: string }) => call('DELETE', `/api/forms/${formId}/steps/${stepId}`))
  );

  server.tool(
    'reorder_steps',
    'Set the display order of a form\'s steps by passing all step ids in the desired order.',
    { formId: z.string(), stepIds: z.array(z.string()) },
    tool(async ({ formId, stepIds }: { formId: string; stepIds: string[] }) =>
      call('PUT', `/api/forms/${formId}/steps/reorder`, { stepIds })
    )
  );

  server.tool(
    'list_submissions',
    'List submissions for a form, with a short preview of the first few answers in each.',
    { formId: z.string() },
    tool(async ({ formId }: { formId: string }) => call('GET', `/api/forms/${formId}/submissions`))
  );

  server.tool(
    'get_submission',
    'Get a single submission with all of its answers.',
    { formId: z.string(), submissionId: z.string() },
    tool(async ({ formId, submissionId }: { formId: string; submissionId: string }) =>
      call('GET', `/api/forms/${formId}/submissions/${submissionId}`)
    )
  );

  return server;
}

const methodNotAllowed = { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null };
const unauthorized = { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized. Provide an Authorization: Bearer <api token> header.' }, id: null };

export default async function mcpRoutes(app: FastifyInstance) {
  app.post('/mcp', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ') || authHeader.length <= 7) {
      reply.header('WWW-Authenticate', 'Bearer');
      return reply.code(401).send(unauthorized);
    }
    const apiToken = authHeader.slice(7);

    const server = buildMcpServer(app, apiToken);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    reply.raw.on('close', () => {
      transport.close();
      server.close();
    });

    reply.hijack();
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  app.get('/mcp', async (_req, reply) => {
    reply.code(405).send(methodNotAllowed);
  });

  app.delete('/mcp', async (_req, reply) => {
    reply.code(405).send(methodNotAllowed);
  });
}
