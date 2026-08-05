import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

let model: ChatAnthropic | null = null;

function getModel(): ChatAnthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('AI features are not configured on this server (missing ANTHROPIC_API_KEY).');
  }
  if (!model) model = new ChatAnthropic({ model: 'claude-opus-5', maxTokens: 8192 });
  return model;
}

const plannedQuestionSchema = z.object({
  type: z.enum(['text', 'multiple_choice', 'file_upload']),
  label: z.string(),
  required: z.boolean(),
  options: z.array(z.string()),
});

const plannedStepSchema = z.object({
  title: z.string(),
  questions: z.array(plannedQuestionSchema),
});

export const formPlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  steps: z.array(plannedStepSchema),
});

export type FormPlan = z.infer<typeof formPlanSchema>;
export type PlannedStep = z.infer<typeof plannedStepSchema>;
export type PlannedQuestion = z.infer<typeof plannedQuestionSchema>;

const analysisSchema = z.object({
  purpose: z.string().describe('One or two sentences on what this form is for'),
  domain: z.string().describe('The sector/domain this form belongs to, e.g. "healthcare intake", "event RSVP"'),
  audience: z.string().describe('Who will be filling this out'),
  clarifyingQuestions: z.array(z.string()).max(3)
    .describe('0-3 questions to ask the user before proceeding, ONLY if genuinely ambiguous — leave empty if the request is clear enough to plan from'),
});

export type Analysis = z.infer<typeof analysisSchema>;

const outlineSchema = z.object({
  title: z.string(),
  description: z.string(),
  steps: z.array(z.object({ title: z.string(), summary: z.string() })),
});

export type Outline = z.infer<typeof outlineSchema>;

function contextBlock(input: { prompt: string; analysis?: Analysis; outline?: Outline; clarificationAnswer?: string }): string {
  const parts = [`Form request: ${input.prompt}`];
  if (input.analysis) parts.push(`Prior analysis: ${JSON.stringify(input.analysis)}`);
  if (input.outline) parts.push(`Prior outline: ${JSON.stringify(input.outline)}`);
  if (input.clarificationAnswer) parts.push(`User's answer to your clarifying question(s): ${input.clarificationAnswer}`);
  return parts.join('\n\n');
}

async function invoke<T extends Record<string, any>>(
  system: string,
  schema: z.ZodType<T>,
  name: string,
  prompt: string,
  signal: AbortSignal,
): Promise<T> {
  const structured = getModel().withStructuredOutput(schema, { name, method: 'jsonSchema' });
  return structured.invoke([new SystemMessage(system), new HumanMessage(prompt)], { signal });
}

export async function analyzePurpose(
  input: { prompt: string; clarificationAnswer?: string },
  signal: AbortSignal,
): Promise<Analysis> {
  return invoke(
    'You are a form-design assistant. Read the user\'s form request and identify its purpose, domain/sector, and ' +
      'intended audience. Only ask clarifying questions if the request is genuinely too ambiguous to design a ' +
      'sensible form from (e.g. missing a key detail that would change the structure) — most requests are clear ' +
      'enough to proceed without any. Leave clarifyingQuestions empty when in doubt.',
    analysisSchema,
    'analysis',
    contextBlock(input),
    signal,
  );
}

export async function draftOutline(
  input: { prompt: string; analysis: Analysis; clarificationAnswer?: string },
  signal: AbortSignal,
): Promise<Outline> {
  return invoke(
    'You are a form-design assistant. Given the form request and your prior analysis of its purpose and domain, ' +
      'draft a concise title, a one-sentence description, and an outline of logical sections (steps). If the form ' +
      'covers several distinct topics or would end up long, split it into multiple steps (e.g. "Basic Info", ' +
      '"Preferences", "Payment"), each with a short title and a one-sentence summary of what it covers, ordered the ' +
      'way a respondent would naturally want to answer them. If the form is small and focused on one topic, use a ' +
      'single step.',
    outlineSchema,
    'outline',
    contextBlock(input),
    signal,
  );
}

export async function buildFullPlan(
  input: { prompt: string; analysis: Analysis; outline: Outline; clarificationAnswer?: string },
  signal: AbortSignal,
): Promise<FormPlan> {
  return invoke(
    'You are a form-design assistant. Given the form request, your prior analysis, and your outline of steps, ' +
      'produce the full form structure: the final title, description, and steps, each filled in with its complete ' +
      'set of questions. Use "text" for open-ended answers, "multiple_choice" for a fixed set of choices (provide ' +
      '2-6 options for these), and "file_upload" for file, document, or image submissions. Only mark a question ' +
      'required when skipping it would make the response unusable. Keep the step titles from the outline.',
    formPlanSchema,
    'form_plan',
    contextBlock(input),
    signal,
  );
}

export interface ConversationStateLike {
  phase: 'new' | 'awaiting_clarification' | 'outlining' | 'building' | 'done';
  prompt: string;
  analysis?: Analysis;
  outline?: Outline;
  clarificationAnswer?: string;
}

export type AgentEvent =
  | { type: 'step'; phase: 'analyzing' | 'outlining' | 'building'; status: 'start' | 'done'; label: string }
  | { type: 'question'; questions: string[] }
  | { type: 'plan'; plan: FormPlan };

export async function runAgentTurn(
  state: ConversationStateLike,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (state.phase === 'new') {
    onEvent({ type: 'step', phase: 'analyzing', status: 'start', label: 'Understanding your request…' });
    const analysis = await analyzePurpose({ prompt: state.prompt }, signal);
    state.analysis = analysis;
    onEvent({ type: 'step', phase: 'analyzing', status: 'done', label: 'Understood the purpose and domain' });

    if (analysis.clarifyingQuestions.length > 0) {
      state.phase = 'awaiting_clarification';
      onEvent({ type: 'question', questions: analysis.clarifyingQuestions });
      return;
    }
    state.phase = 'outlining';
  } else if (state.phase === 'awaiting_clarification') {
    state.phase = 'outlining';
  }

  onEvent({ type: 'step', phase: 'outlining', status: 'start', label: 'Drafting the plan outline…' });
  const outline = await draftOutline(
    { prompt: state.prompt, analysis: state.analysis!, clarificationAnswer: state.clarificationAnswer },
    signal,
  );
  state.outline = outline;
  state.phase = 'building';
  onEvent({ type: 'step', phase: 'outlining', status: 'done', label: 'Outlined the form structure' });

  onEvent({ type: 'step', phase: 'building', status: 'start', label: 'Building the full question set…' });
  const plan = await buildFullPlan(
    { prompt: state.prompt, analysis: state.analysis!, outline: state.outline!, clarificationAnswer: state.clarificationAnswer },
    signal,
  );
  onEvent({ type: 'step', phase: 'building', status: 'done', label: 'Finished building the plan' });
  state.phase = 'done';
  onEvent({ type: 'plan', plan });
}
