const API_BASE = '/api';

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
  listForms: () => request<{ forms: any[] }>('/forms'),
  createForm: () => request<{ form: any }>('/forms', { method: 'POST' }),
  getForm: (id: string) => request<{ form: any; questions: any[]; steps: any[] }>(`/forms/${id}`),
  updateForm: (id: string, data: any) =>
    request<{ form: any }>(`/forms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteForm: (id: string) =>
    request<{ success: boolean }>(`/forms/${id}`, { method: 'DELETE' }),

  // Public forms
  getPublicForm: (slug: string) =>
    request<{ form: any; questions: any[]; steps: any[] }>(`/forms/public/${slug}`),
  submitForm: (slug: string, formData: FormData) =>
    fetch(`${API_BASE}/forms/public/${slug}/submit`, { method: 'POST', body: formData })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submission failed');
        return data;
      }),

  // Questions
  addQuestion: (formId: string, data: any) =>
    request<{ question: any }>(`/forms/${formId}/questions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateQuestion: (formId: string, questionId: string, data: any) =>
    request<{ question: any }>(`/forms/${formId}/questions/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteQuestion: (formId: string, questionId: string) =>
    request<{ success: boolean }>(`/forms/${formId}/questions/${questionId}`, {
      method: 'DELETE',
    }),
  reorderQuestions: (formId: string, questionIds: string[]) =>
    request<{ questions: any[] }>(`/forms/${formId}/questions/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ questionIds }),
    }),

  // Steps
  addStep: (formId: string, title: string) =>
    request<{ step: any }>(`/forms/${formId}/steps`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateStep: (formId: string, stepId: string, title: string) =>
    request<{ step: any }>(`/forms/${formId}/steps/${stepId}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteStep: (formId: string, stepId: string) =>
    request<{ success: boolean }>(`/forms/${formId}/steps/${stepId}`, { method: 'DELETE' }),
  reorderSteps: (formId: string, stepIds: string[]) =>
    request<{ steps: any[] }>(`/forms/${formId}/steps/reorder`, { method: 'PUT', body: JSON.stringify({ stepIds }) }),

  // Submissions
  listSubmissions: (formId: string) =>
    request<{ submissions: any[] }>(`/forms/${formId}/submissions`),
  getSubmission: (formId: string, submissionId: string) =>
    request<{ submission: any; answers: any[] }>(`/forms/${formId}/submissions/${submissionId}`),

  // AI
  improveQuestion: (label: string) =>
    request<{ label: string }>('/ai/improve-question', { method: 'POST', body: JSON.stringify({ label }) }),
  suggestOptions: (label: string) =>
    request<{ options: string[] }>('/ai/suggest-options', { method: 'POST', body: JSON.stringify({ label }) }),
  planForm: (prompt: string) =>
    request<{ plan: FormPlan }>('/ai/plan-form', { method: 'POST', body: JSON.stringify({ prompt }) }),
  createFormFromPlan: (plan: FormPlan) =>
    request<{ form: any }>('/ai/create-form', { method: 'POST', body: JSON.stringify(plan) }),
};

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
