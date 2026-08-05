import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

const OPENROUTER_MODEL = 'inclusionai/ling-3.0-flash:free';

let model: ChatOpenAI | null = null;

function getModel(): ChatOpenAI {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('AI features are not configured on this server (missing OPENROUTER_API_KEY).');
  }
  if (!model) {
    model = new ChatOpenAI({
      model: OPENROUTER_MODEL,
      apiKey: process.env.OPENROUTER_API_KEY,
      maxTokens: 512,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://formly-4gbd.onrender.com',
          'X-Title': 'Formly',
        },
      },
    });
  }
  return model;
}

const STRUCTURED_OUTPUT_ATTEMPTS = 3;

export async function askLLMJSON<T>(opts: {
  system?: string;
  prompt: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  // See the matching comment in agent.ts: jsonMode needs the schema spelled out
  // in the prompt, and a retry or two for the occasional malformed reply.
  const fullPrompt = `${opts.prompt}\n\nRespond with ONLY a JSON object (no markdown, no explanation) matching this schema:\n${JSON.stringify(opts.schema)}`;
  const structured = getModel().withStructuredOutput(opts.schema, { name: 'response', method: 'jsonMode' });
  const messages = [];
  if (opts.system) messages.push(new SystemMessage(opts.system));
  messages.push(new HumanMessage(fullPrompt));

  let lastError: unknown;
  for (let attempt = 0; attempt < STRUCTURED_OUTPUT_ATTEMPTS; attempt++) {
    try {
      return await structured.invoke(messages) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
