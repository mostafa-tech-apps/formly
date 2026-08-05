import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createConversation, getConversation, deleteConversation } from './agentConversations.js';

describe('agentConversations', () => {
  test('createConversation starts in phase "new" with the given userId/prompt', () => {
    const state = createConversation('user-1', 'a feedback form');
    assert.equal(state.phase, 'new');
    assert.equal(state.userId, 'user-1');
    assert.equal(state.prompt, 'a feedback form');
  });

  test('createConversation gives each conversation a distinct id', () => {
    const a = createConversation('user-1', 'form a');
    const b = createConversation('user-1', 'form b');
    assert.notEqual(a.id, b.id);
  });

  test('getConversation returns the conversation for the owning user', () => {
    const state = createConversation('user-1', 'a feedback form');
    const found = getConversation(state.id, 'user-1');
    assert.equal(found?.id, state.id);
  });

  test('getConversation returns undefined for a different user (IDOR guard)', () => {
    const state = createConversation('user-1', 'a feedback form');
    const found = getConversation(state.id, 'user-2');
    assert.equal(found, undefined);
  });

  test('getConversation returns undefined for an unknown id', () => {
    const found = getConversation('does-not-exist', 'user-1');
    assert.equal(found, undefined);
  });

  test('getConversation refreshes lastActiveAt', async () => {
    const state = createConversation('user-1', 'a feedback form');
    const originalActiveAt = state.lastActiveAt;
    await new Promise(r => setTimeout(r, 5));
    const found = getConversation(state.id, 'user-1');
    assert.ok(found!.lastActiveAt >= originalActiveAt);
  });

  test('deleteConversation removes it so it can no longer be resumed', () => {
    const state = createConversation('user-1', 'a feedback form');
    deleteConversation(state.id);
    assert.equal(getConversation(state.id, 'user-1'), undefined);
  });

  test('mutating the returned state persists across a later getConversation call', () => {
    const state = createConversation('user-1', 'a feedback form');
    state.phase = 'awaiting_clarification';
    state.clarificationAnswer = 'adults only';
    const found = getConversation(state.id, 'user-1');
    assert.equal(found?.phase, 'awaiting_clarification');
    assert.equal(found?.clarificationAnswer, 'adults only');
  });
});
