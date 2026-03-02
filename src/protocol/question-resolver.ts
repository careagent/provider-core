/**
 * Question resolver — evaluates conditional logic and determines
 * the next question in a questionnaire session.
 */

import type { Questionnaire, Question, QuestionCondition } from '@careagent/axon/types';
import type { InteractionSession } from './session.js';

// ---------------------------------------------------------------------------
// resolveNextQuestion
// ---------------------------------------------------------------------------

/**
 * Determine the next unanswered question whose conditions are met.
 * Returns null if all applicable questions have been answered (questionnaire complete).
 */
export function resolveNextQuestion(
  questionnaire: Questionnaire,
  session: InteractionSession,
): Question | null {
  for (const question of questionnaire.questions) {
    // Skip already-answered questions
    if (session.answers.has(question.id)) continue;

    // Skip questions whose show_when condition evaluates false
    if (question.show_when) {
      if (!evaluateCondition(question.show_when, session.answers)) continue;
    }

    // Skip optional questions that are not required (engine only asks required questions)
    // Note: optional questions are still asked — they can be skipped by the user

    return question;
  }

  return null;
}

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

/**
 * Evaluate a show_when condition against current answers.
 * Supports both legacy `equals` format and new `operator`+`value` format.
 */
export function evaluateCondition(
  condition: QuestionCondition,
  answers: Map<string, unknown>,
): boolean {
  const answerValue = answers.get(condition.question_id);

  // If the referenced question hasn't been answered yet, condition is false
  if (answerValue === undefined) return false;

  const answerStr = String(answerValue);

  // Legacy format: direct equals comparison
  if (condition.equals !== undefined) {
    return answerStr === condition.equals;
  }

  // New format: operator + value
  if (condition.operator !== undefined && condition.value !== undefined) {
    switch (condition.operator) {
      case 'equals':
        return answerStr === condition.value;
      case 'not_equals':
        return answerStr !== condition.value;
      case 'contains':
        return answerStr.includes(condition.value);
      case 'greater_than': {
        const num = Number(answerStr);
        const threshold = Number(condition.value);
        return Number.isFinite(num) && Number.isFinite(threshold) && num > threshold;
      }
      case 'less_than': {
        const num = Number(answerStr);
        const threshold = Number(condition.value);
        return Number.isFinite(num) && Number.isFinite(threshold) && num < threshold;
      }
      default:
        return false;
    }
  }

  return false;
}
