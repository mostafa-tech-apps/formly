export interface Form {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  slug: string | null;
  created_at: string;
  updated_at: string;
  submission_count?: number;
  question_count?: number;
}

export type RuleOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty' | 'includes' | 'not_includes';
export type LogicGroupOperator = 'AND' | 'OR' | 'NOT';

export interface VisibilityRule {
  type: 'rule';
  questionId: string;
  operator: RuleOperator;
  value?: any;
}

export interface VisibilityGroup {
  type: 'group';
  operator: LogicGroupOperator;
  conditions: (VisibilityRule | VisibilityGroup)[];
}

export type VisibilityLogic = VisibilityGroup | null;

export interface Question {
  id: string;
  form_id: string;
  step_id: string | null;
  type: 'text' | 'multiple_choice' | 'file_upload';
  label: string;
  required: number | boolean;
  options: string; // JSON string of string[]
  order_index: number;
  visibility_rules: string | null; // JSON string of VisibilityLogic
  created_at: string;
}

export interface Step {
  id: string;
  form_id: string;
  title: string;
  order_index: number;
  created_at?: string;
}

export function parseVisibilityRules(rules: string | null): VisibilityLogic {
  if (!rules) return null;
  try {
    return JSON.parse(rules);
  } catch {
    return null;
  }
}

export interface Submission {
  id: string;
  form_id: string;
  submitted_at: string;
  answer_count?: number;
  preview?: SubmissionPreview[];
}

export interface SubmissionPreview {
  label: string;
  value: string;
  file_name: string | null;
  type: string;
}

export interface Answer {
  id: string;
  submission_id: string;
  question_id: string;
  value: string;
  file_path: string | null;
  file_name: string | null;
  question_label: string;
  question_type: string;
  question_options: string;
}

export function parseOptions(options: string): string[] {
  try {
    return JSON.parse(options);
  } catch {
    return [];
  }
}

export function isRequired(required: number | boolean): boolean {
  return required === 1 || required === true;
}

export function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\b(am|pm)\b/i, m => m.toUpperCase());
}
