import { nanoid } from 'nanoid';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'form';
}

export function uniqueSlug(base: string): string {
  return `${base}-${nanoid(6)}`;
}
