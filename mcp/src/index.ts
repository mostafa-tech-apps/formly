#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { api } from './api.js';

const server = new McpServer({ name: 'formly', version: '1.0.0' });

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
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

const questionType = z.enum(['text', 'multiple_choice', 'file_upload']);
const formStatus = z.enum(['draft', 'published']);

server.tool(
  'list_forms',
  'List all forms with their status, question count, and submission count.',
  {},
  tool(async () => api('/api/forms'))
);

server.tool(
  'get_form',
  'Get a single form by id, including its full question list.',
  { formId: z.string().describe('The form id') },
  tool(async ({ formId }: { formId: string }) => api(`/api/forms/${formId}`))
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
    const { form } = await api<{ form: any }>('/api/forms', { method: 'POST' });
    if (title !== undefined || description !== undefined || status !== undefined) {
      return api(`/api/forms/${form.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, description, status }),
      });
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
    api(`/api/forms/${formId}`, { method: 'PUT', body: JSON.stringify(body) })
  )
);

server.tool(
  'delete_form',
  'Permanently delete a form and all of its questions and submissions.',
  { formId: z.string() },
  tool(async ({ formId }: { formId: string }) => api(`/api/forms/${formId}`, { method: 'DELETE' }))
);

server.tool(
  'add_question',
  'Add a question to a form. The "options" field is only used for multiple_choice questions.',
  {
    formId: z.string(),
    type: questionType,
    label: z.string(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional().describe('Choice labels, for multiple_choice questions only'),
  },
  tool(async ({ formId, ...body }: { formId: string; type: string; label: string; required?: boolean; options?: string[] }) =>
    api(`/api/forms/${formId}/questions`, { method: 'POST', body: JSON.stringify(body) })
  )
);

server.tool(
  'update_question',
  'Update an existing question\'s type, label, required flag, or options.',
  {
    formId: z.string(),
    questionId: z.string(),
    type: questionType.optional(),
    label: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
  },
  tool(async ({ formId, questionId, ...body }: { formId: string; questionId: string; type?: string; label?: string; required?: boolean; options?: string[] }) =>
    api(`/api/forms/${formId}/questions/${questionId}`, { method: 'PUT', body: JSON.stringify(body) })
  )
);

server.tool(
  'delete_question',
  'Delete a question from a form. A published form must keep at least one question.',
  { formId: z.string(), questionId: z.string() },
  tool(async ({ formId, questionId }: { formId: string; questionId: string }) =>
    api(`/api/forms/${formId}/questions/${questionId}`, { method: 'DELETE' })
  )
);

server.tool(
  'reorder_questions',
  'Set the display order of a form\'s questions by passing all question ids in the desired order.',
  { formId: z.string(), questionIds: z.array(z.string()) },
  tool(async ({ formId, questionIds }: { formId: string; questionIds: string[] }) =>
    api(`/api/forms/${formId}/questions/reorder`, { method: 'PUT', body: JSON.stringify({ questionIds }) })
  )
);

server.tool(
  'list_submissions',
  'List submissions for a form, with a short preview of the first few answers in each.',
  { formId: z.string() },
  tool(async ({ formId }: { formId: string }) => api(`/api/forms/${formId}/submissions`))
);

server.tool(
  'get_submission',
  'Get a single submission with all of its answers.',
  { formId: z.string(), submissionId: z.string() },
  tool(async ({ formId, submissionId }: { formId: string; submissionId: string }) =>
    api(`/api/forms/${formId}/submissions/${submissionId}`)
  )
);

const transport = new StdioServerTransport();
await server.connect(transport);
