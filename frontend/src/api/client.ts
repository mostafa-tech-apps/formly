import type { Form, Question, Step, Submission, Answer, VisibilityLogic } from '../types';

const API_BASE = '/api';

// The public form endpoint omits a few columns present on the authenticated
// Form row (created_at/updated_at, submission_count/question_count) — this
// is what it actually returns, not a loosened version of Form.
export interface PublicFormMeta {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  slug: string;
}

// Request-body shape for creating/updating a question — mirrors the backend's
// QuestionBody (backend/src/routes/questions.ts). Distinct from Question
// itself: options/visibility_rules travel as structured values here, not the
// JSON-stringified form they're stored/returned in.
export interface QuestionInput {
  type?: 'text' | 'multiple_choice' | 'file_upload';
  label?: string;
  required?: boolean;
  options?: string[];
  visibility_rules?: VisibilityLogic;
  step_id?: string | null;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const isWrite = options?.method === 'POST' || options?.method === 'PUT';
  const hasBody = options?.body !== undefined;
  const isMultipart = options?.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (isWrite && !isMultipart) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...headers,
      ...options?.headers,
    },
    body: isWrite && !hasBody && !isMultipart ? '{}' : options?.body,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Forms
export const api = {
  // Auth
  signup: (email: string, password: string) =>
    request<{ user: { id: string; email: string } }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: { id: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: { id: string; email: string; hasApiToken: boolean } }>('/auth/me'),
  generateApiToken: () => request<{ token: string }>('/auth/token', { method: 'POST' }),
  revokeApiToken: () => request<{ success: boolean }>('/auth/token', { method: 'DELETE' }),

  // Forms
  listForms: () => request<{ forms: Form[] }>('/forms'),
  createForm: () => request<{ form: Form }>('/forms', { method: 'POST' }),
  getForm: (id: string) => request<{ form: Form; questions: Question[]; steps: Step[] }>(`/forms/${id}`),
  updateForm: (id: string, data: Partial<Pick<Form, 'title' | 'description' | 'status'>>) =>
    request<{ form: Form }>(`/forms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteForm: (id: string) =>
    request<{ success: boolean }>(`/forms/${id}`, { method: 'DELETE' }),

  // Public forms
  getPublicForm: (slug: string) =>
    request<{ form: PublicFormMeta; questions: Question[]; steps: Step[] }>(`/forms/public/${slug}`),
  submitForm: (slug: string, formData: FormData) =>
    fetch(`${API_BASE}/forms/public/${slug}/submit`, { method: 'POST', body: formData })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submission failed');
        return data as { success: boolean; submissionId: string };
      }),

  // Questions
  addQuestion: (formId: string, data: QuestionInput) =>
    request<{ question: Question }>(`/forms/${formId}/questions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateQuestion: (formId: string, questionId: string, data: QuestionInput) =>
    request<{ question: Question }>(`/forms/${formId}/questions/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteQuestion: (formId: string, questionId: string) =>
    request<{ success: boolean }>(`/forms/${formId}/questions/${questionId}`, {
      method: 'DELETE',
    }),
  reorderQuestions: (formId: string, questionIds: string[]) =>
    request<{ questions: Question[] }>(`/forms/${formId}/questions/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ questionIds }),
    }),

  // Steps
  addStep: (formId: string, title: string) =>
    request<{ step: Step }>(`/forms/${formId}/steps`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateStep: (formId: string, stepId: string, title: string) =>
    request<{ step: Step }>(`/forms/${formId}/steps/${stepId}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteStep: (formId: string, stepId: string) =>
    request<{ success: boolean }>(`/forms/${formId}/steps/${stepId}`, { method: 'DELETE' }),
  reorderSteps: (formId: string, stepIds: string[]) =>
    request<{ steps: Step[] }>(`/forms/${formId}/steps/reorder`, { method: 'PUT', body: JSON.stringify({ stepIds }) }),

  // Submissions
  listSubmissions: (formId: string) =>
    request<{ submissions: Submission[] }>(`/forms/${formId}/submissions`),
  getSubmission: (formId: string, submissionId: string) =>
    request<{ submission: Submission; answers: Answer[] }>(`/forms/${formId}/submissions/${submissionId}`),

  // AI
  improveQuestion: (label: string) =>
    request<{ label: string }>('/ai/improve-question', { method: 'POST', body: JSON.stringify({ label }) }),
  suggestOptions: (label: string) =>
    request<{ options: string[] }>('/ai/suggest-options', { method: 'POST', body: JSON.stringify({ label }) }),
  createFormFromPlan: (plan: FormPlan) =>
    request<{ form: Form }>('/ai/create-form', { method: 'POST', body: JSON.stringify(plan) }),
};

// Streams the agentic form-planning pipeline. Not on the `api` object since it's
// callback-driven/void-returning rather than a plain request/response call.
export interface SSEEvent {
  event: string;
  data: any;
}

export async function streamPlanForm(
  body: { conversationId?: string; message: string },
  onEvent: (evt: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/plan-form`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let event = 'message';
      let dataLine = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) dataLine += line.slice(6);
      }
      if (dataLine) onEvent({ event, data: JSON.parse(dataLine) });
    }
  }
}

export interface PlannedQuestion {
  type: 'text' | 'multiple_choice' | 'file_upload';
  label: string;
  required: boolean;
  options: string[];
}

export interface PlannedStep {
  title: string;
  questions: PlannedQuestion[];
}

export interface FormPlan {
  title: string;
  description: string;
  steps: PlannedStep[];
}
