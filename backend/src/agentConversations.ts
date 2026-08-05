import { nanoid } from 'nanoid';
import type { Analysis, Outline } from './agent.js';

export interface ConversationState {
  id: string;
  userId: string;
  phase: 'new' | 'awaiting_clarification' | 'thinking' | 'planning' | 'done';
  prompt: string;
  analysis?: Analysis;
  outline?: Outline;
  clarificationAnswer?: string;
  createdAt: number;
  lastActiveAt: number;
}

const TTL_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const conversations = new Map<string, ConversationState>();

export function createConversation(userId: string, prompt: string): ConversationState {
  const now = Date.now();
  const state: ConversationState = {
    id: nanoid(),
    userId,
    phase: 'new',
    prompt,
    createdAt: now,
    lastActiveAt: now,
  };
  conversations.set(state.id, state);
  return state;
}

export function getConversation(id: string, userId: string): ConversationState | undefined {
  const state = conversations.get(id);
  if (!state || state.userId !== userId) return undefined;
  state.lastActiveAt = Date.now();
  return state;
}

export function deleteConversation(id: string): void {
  conversations.delete(id);
}

// tsx watch hot-reloads this module on save; guard so the sweep interval
// isn't re-registered (and old ones leaked) on every reload in dev.
const g = globalThis as any;
if (!g.__formlyAgentSweepStarted) {
  g.__formlyAgentSweepStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, state] of conversations) {
      if (now - state.lastActiveAt > TTL_MS) conversations.delete(id);
    }
  }, SWEEP_INTERVAL_MS).unref();
}
