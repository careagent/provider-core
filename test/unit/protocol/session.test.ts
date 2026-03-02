/**
 * Tests for session state machine — creation, advancement, completion, UUIDv7.
 */

import { describe, it, expect } from 'vitest';
import {
  createSession,
  advanceSession,
  completeSession,
  failSession,
  generateUUIDv7,
} from '../../../src/protocol/session.js';

describe('UUIDv7', () => {
  it('generates valid UUID format', () => {
    const uuid = generateUUIDv7();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUIDv7()));
    expect(ids.size).toBe(100);
  });

  it('IDs are time-sortable (lexicographic)', () => {
    const id1 = generateUUIDv7();
    const id2 = generateUUIDv7();
    // Same millisecond may produce same prefix, but should not be less
    expect(id2 >= id1).toBe(true);
  });
});

describe('Session lifecycle', () => {
  it('creates session with correct initial state', () => {
    const session = createSession('physician');

    expect(session.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(session.questionnaire_id).toBe('physician');
    expect(session.answers.size).toBe(0);
    expect(session.conversation_history).toEqual([]);
    expect(session.status).toBe('created');
    expect(session.current_question_id).toBeNull();
    expect(session.created_at).toBeTruthy();
    expect(session.completed_at).toBeNull();
    expect(session.error).toBeNull();
  });

  it('advances session with answer', () => {
    const session = createSession('test');
    const advanced = advanceSession(session, 'q1', true);

    expect(advanced.answers.get('q1')).toBe(true);
    expect(advanced.status).toBe('active');
  });

  it('advances session with multiple answers', () => {
    let session = createSession('test');
    session = advanceSession(session, 'q1', true);
    session = advanceSession(session, 'q2', 'hello');
    session = advanceSession(session, 'q3', 42);

    expect(session.answers.size).toBe(3);
    expect(session.answers.get('q1')).toBe(true);
    expect(session.answers.get('q2')).toBe('hello');
    expect(session.answers.get('q3')).toBe(42);
  });

  it('completes session', () => {
    let session = createSession('test');
    session = advanceSession(session, 'q1', true);
    session = completeSession(session);

    expect(session.status).toBe('completed');
    expect(session.completed_at).toBeTruthy();
  });

  it('fails session with error', () => {
    let session = createSession('test');
    session = failSession(session, 'Max retries exceeded');

    expect(session.status).toBe('failed');
    expect(session.error).toBe('Max retries exceeded');
    expect(session.completed_at).toBeTruthy();
  });

  it('preserves answers through completion', () => {
    let session = createSession('test');
    session = advanceSession(session, 'q1', true);
    session = advanceSession(session, 'q2', 'text');
    session = completeSession(session);

    expect(session.answers.size).toBe(2);
    expect(session.answers.get('q1')).toBe(true);
  });

  it('each session has unique ID', () => {
    const s1 = createSession('test');
    const s2 = createSession('test');
    expect(s1.session_id).not.toBe(s2.session_id);
  });
});
