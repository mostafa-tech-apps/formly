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

export interface Question {
  id: string;
  form_id: string;
  type: 'text' | 'multiple_choice' | 'file_upload';
  label: string;
  required: number | boolean;
  options: string; // JSON string of string[]
  order_index: number;
  created_at: string;
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
