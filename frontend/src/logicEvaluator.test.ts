import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLogic } from './logicEvaluator.js';
import type { VisibilityRule, VisibilityGroup } from './types.js';

const rule = (questionId: string, operator: VisibilityRule['operator'], value?: string): VisibilityRule => ({
  type: 'rule',
  questionId,
  operator,
  value,
});

const group = (operator: VisibilityGroup['operator'], conditions: VisibilityGroup['conditions']): VisibilityGroup => ({
  type: 'group',
  operator,
  conditions,
});

describe('evaluateLogic', () => {
  test('null logic is always visible', () => {
    assert.equal(evaluateLogic(null, {}, {}), true);
  });

  test('empty conditions array is visible', () => {
    assert.equal(evaluateLogic(group('AND', []), {}, {}), true);
  });

  describe('AND', () => {
    test('true only when every condition passes', () => {
      const logic = group('AND', [rule('q1', 'equals', 'yes'), rule('q2', 'equals', 'yes')]);
      assert.equal(evaluateLogic(logic, { q1: 'yes', q2: 'yes' }, {}), true);
      assert.equal(evaluateLogic(logic, { q1: 'yes', q2: 'no' }, {}), false);
    });
  });

  describe('OR', () => {
    test('true when any condition passes', () => {
      const logic = group('OR', [rule('q1', 'equals', 'yes'), rule('q2', 'equals', 'yes')]);
      assert.equal(evaluateLogic(logic, { q1: 'no', q2: 'yes' }, {}), true);
      assert.equal(evaluateLogic(logic, { q1: 'no', q2: 'no' }, {}), false);
    });
  });

  describe('NOT', () => {
    test('true only when every condition fails', () => {
      const logic = group('NOT', [rule('q1', 'equals', 'yes')]);
      assert.equal(evaluateLogic(logic, { q1: 'no' }, {}), true);
      assert.equal(evaluateLogic(logic, { q1: 'yes' }, {}), false);
    });
  });

  test('nested groups evaluate recursively', () => {
    // visible if q1 == 'yes' AND (q2 == 'a' OR q2 == 'b')
    const logic = group('AND', [
      rule('q1', 'equals', 'yes'),
      group('OR', [rule('q2', 'equals', 'a'), rule('q2', 'equals', 'b')]),
    ]);
    assert.equal(evaluateLogic(logic, { q1: 'yes', q2: 'b' }, {}), true);
    assert.equal(evaluateLogic(logic, { q1: 'yes', q2: 'c' }, {}), false);
    assert.equal(evaluateLogic(logic, { q1: 'no', q2: 'a' }, {}), false);
  });

  describe('operators', () => {
    const answers = { q1: 'Hello World' };

    test('equals / not_equals', () => {
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'equals', 'Hello World')]), answers, {}), true);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'not_equals', 'Hello World')]), answers, {}), false);
    });

    test('contains / not_contains is case-insensitive', () => {
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'contains', 'hello')]), answers, {}), true);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'not_contains', 'hello')]), answers, {}), false);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'contains', 'goodbye')]), answers, {}), false);
    });

    test('includes / not_includes behave like equals for single-select', () => {
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'includes', 'Hello World')]), answers, {}), true);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'not_includes', 'Hello World')]), answers, {}), false);
    });

    test('is_empty / is_not_empty on a text answer', () => {
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'is_empty')]), { q1: '' }, {}), true);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'is_empty')]), { q1: '  ' }, {}), true);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'is_empty')]), answers, {}), false);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'is_not_empty')]), answers, {}), true);
    });

    test('is_empty / is_not_empty treat an uploaded file as non-empty', () => {
      const files = { q1: new File(['x'], 'a.txt') };
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'is_empty')]), {}, files), false);
      assert.equal(evaluateLogic(group('AND', [rule('q1', 'is_not_empty')]), {}, files), true);
    });

    test('missing answer is treated as an empty string', () => {
      assert.equal(evaluateLogic(group('AND', [rule('missing', 'equals', '')]), {}, {}), true);
      assert.equal(evaluateLogic(group('AND', [rule('missing', 'is_empty')]), {}, {}), true);
    });

    test('unknown operator defaults to visible', () => {
      const logic = group('AND', [rule('q1', 'nonsense' as any)]);
      assert.equal(evaluateLogic(logic, answers, {}), true);
    });
  });
});
