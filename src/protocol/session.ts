/**
 * Interaction session state machine.
 * Tracks questionnaire progress: answers, conversation history, status.
 */

import { randomBytes } from 'node:crypto';
import type { LLMMessage } from './llm-client.js';

// ---------------------------------------------------------------------------
// UUIDv7 — minimal implementation (~15 lines)
// ---------------------------------------------------------------------------

export function generateUUIDv7(): string {
  const now = Date.now();
  const timeBytes = new Uint8Array(6);
  for (let i = 5; i >= 0; i--) {
    timeBytes[i] = (now >> ((5 - i) * 8)) & 0xff;
  }
  const randBytes = randomBytes(10);
  // Set version (7) in high nibble of byte 6
  randBytes[0] = (randBytes[0]! & 0x0f) | 0x70;
  // Set variant (10xx) in high 2 bits of byte 8
  randBytes[2] = (randBytes[2]! & 0x3f) | 0x80;

  const hex = Buffer.concat([timeBytes, randBytes]).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionStatus = 'created' | 'active' | 'completed' | 'failed';

export interface InteractionSession {
  session_id: string;
  questionnaire_id: string;
  answers: Map<string, unknown>;
  conversation_history: LLMMessage[];
  status: SessionStatus;
  current_question_id: string | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Session lifecycle functions
// ---------------------------------------------------------------------------

export function createSession(questionnaireId: string): InteractionSession {
  return {
    session_id: generateUUIDv7(),
    questionnaire_id: questionnaireId,
    answers: new Map(),
    conversation_history: [],
    status: 'created',
    current_question_id: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    error: null,
  };
}

export function advanceSession(
  session: InteractionSession,
  questionId: string,
  answer: unknown,
): InteractionSession {
  session.answers.set(questionId, answer);
  session.status = 'active';
  return session;
}

export function completeSession(session: InteractionSession): InteractionSession {
  session.status = 'completed';
  session.completed_at = new Date().toISOString();
  return session;
}

export function failSession(session: InteractionSession, error: string): InteractionSession {
  session.status = 'failed';
  session.error = error;
  session.completed_at = new Date().toISOString();
  return session;
}
