import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug } from './slug.js';

describe('slugify', () => {
  test('lowercases and hyphenates spaces', () => {
    assert.equal(slugify('Customer Feedback Form'), 'customer-feedback-form');
  });

  test('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    assert.equal(slugify('RSVP!! -- 2026??'), 'rsvp-2026');
  });

  test('trims leading and trailing hyphens', () => {
    assert.equal(slugify('  --Hello World--  '), 'hello-world');
  });

  test('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    assert.equal(slugify(long).length, 60);
  });

  test('falls back to "form" when nothing alphanumeric remains', () => {
    assert.equal(slugify('!!!'), 'form');
    assert.equal(slugify(''), 'form');
  });
});

describe('uniqueSlug', () => {
  test('appends a suffix to the base', () => {
    const slug = uniqueSlug('event-rsvp');
    assert.match(slug, /^event-rsvp-[a-zA-Z0-9_-]{6}$/);
  });

  test('produces different values on repeated calls', () => {
    const a = uniqueSlug('event-rsvp');
    const b = uniqueSlug('event-rsvp');
    assert.notEqual(a, b);
  });
});
