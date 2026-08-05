import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('AI features are not configured on this server (missing ANTHROPIC_API_KEY).');
  }
  if (!client) client = new Anthropic();
  return client;
}

export async function askClaudeJSON<T>(opts: {
  system?: string;
  prompt: string;
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}): Promise<T> {
  const res = await getClient().messages.create({
    model: 'claude-opus-5',
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.system ? { system: opts.system } : {}),
    output_config: {
      effort: opts.effort ?? 'medium',
      format: { type: 'json_schema', schema: opts.schema },
    },
    messages: [{ role: 'user', content: opts.prompt }],
  });

  if (res.stop_reason === 'refusal') {
    throw new Error('The AI declined this request.');
  }

  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) {
    throw new Error('The AI returned no usable output.');
  }

  return JSON.parse(textBlock.text) as T;
}
