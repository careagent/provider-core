/**
 * Tests for question resolver — conditional logic, skip, completion detection.
 */

import { describe, it, expect } from 'vitest';
import { resolveNextQuestion, evaluateCondition } from '../../../src/protocol/question-resolver.js';
import { createSession, advanceSession } from '../../../src/protocol/session.js';
import type { Questionnaire, QuestionCondition } from '@careagent/axon/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestionnaire(questions: unknown[]): Questionnaire {
  return {
    provider_type: 'test',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Test',
    description: 'Test questionnaire',
    questions,
  } as Questionnaire;
}

// ---------------------------------------------------------------------------
// resolveNextQuestion
// ---------------------------------------------------------------------------

describe('resolveNextQuestion', () => {
  it('returns first question for new session', () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'First?', answer_type: 'boolean', required: true },
      { id: 'q2', text: 'Second?', answer_type: 'boolean', required: true },
    ]);
    const session = createSession('test');
    const next = resolveNextQuestion(q, session);
    expect(next?.id).toBe('q1');
  });

  it('skips answered questions', () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'First?', answer_type: 'boolean', required: true },
      { id: 'q2', text: 'Second?', answer_type: 'boolean', required: true },
    ]);
    let session = createSession('test');
    session = advanceSession(session, 'q1', true);
    const next = resolveNextQuestion(q, session);
    expect(next?.id).toBe('q2');
  });

  it('returns null when all questions answered', () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'First?', answer_type: 'boolean', required: true },
    ]);
    let session = createSession('test');
    session = advanceSession(session, 'q1', true);
    const next = resolveNextQuestion(q, session);
    expect(next).toBeNull();
  });

  it('skips questions with false show_when condition', () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Yes/No?', answer_type: 'boolean', required: true },
      {
        id: 'q2',
        text: 'Follow-up?',
        answer_type: 'text',
        required: true,
        show_when: { question_id: 'q1', equals: 'true' },
      },
      { id: 'q3', text: 'Final?', answer_type: 'boolean', required: true },
    ]);
    let session = createSession('test');
    session = advanceSession(session, 'q1', false);
    const next = resolveNextQuestion(q, session);
    // q2 should be skipped (q1 answered false, condition requires true)
    expect(next?.id).toBe('q3');
  });

  it('shows conditional question when condition is true', () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Yes/No?', answer_type: 'boolean', required: true },
      {
        id: 'q2',
        text: 'Follow-up?',
        answer_type: 'text',
        required: true,
        show_when: { question_id: 'q1', equals: 'true' },
      },
    ]);
    let session = createSession('test');
    session = advanceSession(session, 'q1', true);
    const next = resolveNextQuestion(q, session);
    expect(next?.id).toBe('q2');
  });

  it('handles chained conditional questions', () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'First?', answer_type: 'boolean', required: true },
      {
        id: 'q2',
        text: 'Second?',
        answer_type: 'boolean',
        required: true,
        show_when: { question_id: 'q1', equals: 'true' },
      },
      {
        id: 'q3',
        text: 'Third?',
        answer_type: 'text',
        required: true,
        show_when: { question_id: 'q2', equals: 'true' },
      },
    ]);

    let session = createSession('test');
    session = advanceSession(session, 'q1', true);
    session = advanceSession(session, 'q2', true);
    const next = resolveNextQuestion(q, session);
    expect(next?.id).toBe('q3');
  });

  it('returns null for empty questionnaire', () => {
    const q = makeQuestionnaire([]);
    const session = createSession('test');
    expect(resolveNextQuestion(q, session)).toBeNull();
  });

  it('skips question when referenced answer not yet given', () => {
    const q = makeQuestionnaire([
      {
        id: 'q1',
        text: 'Conditional?',
        answer_type: 'text',
        required: true,
        show_when: { question_id: 'q0', equals: 'true' }, // q0 doesn't exist yet
      },
      { id: 'q2', text: 'Normal?', answer_type: 'boolean', required: true },
    ]);
    const session = createSession('test');
    const next = resolveNextQuestion(q, session);
    expect(next?.id).toBe('q2');
  });
});

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  it('legacy equals: matches string answer', () => {
    const answers = new Map<string, unknown>([['q1', 'true']]);
    const cond: QuestionCondition = { question_id: 'q1', equals: 'true' };
    expect(evaluateCondition(cond, answers)).toBe(true);
  });

  it('legacy equals: boolean answer converted to string', () => {
    const answers = new Map<string, unknown>([['q1', true]]);
    const cond: QuestionCondition = { question_id: 'q1', equals: 'true' };
    expect(evaluateCondition(cond, answers)).toBe(true);
  });

  it('legacy equals: mismatch returns false', () => {
    const answers = new Map<string, unknown>([['q1', false]]);
    const cond: QuestionCondition = { question_id: 'q1', equals: 'true' };
    expect(evaluateCondition(cond, answers)).toBe(false);
  });

  it('returns false when referenced question not answered', () => {
    const answers = new Map<string, unknown>();
    const cond: QuestionCondition = { question_id: 'q1', equals: 'true' };
    expect(evaluateCondition(cond, answers)).toBe(false);
  });

  it('operator equals: matches', () => {
    const answers = new Map<string, unknown>([['q1', 'academic']]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'equals', value: 'academic' };
    expect(evaluateCondition(cond, answers)).toBe(true);
  });

  it('operator not_equals: matches', () => {
    const answers = new Map<string, unknown>([['q1', 'private']]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'not_equals', value: 'academic' };
    expect(evaluateCondition(cond, answers)).toBe(true);
  });

  it('operator not_equals: fails when equal', () => {
    const answers = new Map<string, unknown>([['q1', 'academic']]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'not_equals', value: 'academic' };
    expect(evaluateCondition(cond, answers)).toBe(false);
  });

  it('operator contains: matches substring', () => {
    const answers = new Map<string, unknown>([['q1', 'Neurosurgery, Spine']]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'contains', value: 'Spine' };
    expect(evaluateCondition(cond, answers)).toBe(true);
  });

  it('operator contains: fails when not found', () => {
    const answers = new Map<string, unknown>([['q1', 'Cardiology']]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'contains', value: 'Spine' };
    expect(evaluateCondition(cond, answers)).toBe(false);
  });

  it('operator greater_than: numeric comparison', () => {
    const answers = new Map<string, unknown>([['q1', 10]]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'greater_than', value: '5' };
    expect(evaluateCondition(cond, answers)).toBe(true);
  });

  it('operator less_than: numeric comparison', () => {
    const answers = new Map<string, unknown>([['q1', 3]]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'less_than', value: '5' };
    expect(evaluateCondition(cond, answers)).toBe(true);
  });

  it('operator greater_than: non-numeric returns false', () => {
    const answers = new Map<string, unknown>([['q1', 'abc']]);
    const cond: QuestionCondition = { question_id: 'q1', operator: 'greater_than', value: '5' };
    expect(evaluateCondition(cond, answers)).toBe(false);
  });
});
