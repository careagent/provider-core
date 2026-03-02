/**
 * Protocol engine — the orchestrator that replaces BOOTSTRAP.md.
 * Makes direct Claude API calls with zero OpenClaw context.
 * LLM for conversation, code for validation.
 */

import type { Questionnaire, Question } from '@careagent/axon/types';
import type { LLMClient, LLMMessage, LLMContentBlock } from './llm-client.js';
import {
  createSession,
  advanceSession,
  completeSession,
  failSession,
  type InteractionSession,
} from './session.js';
import { validateAnswer } from './validator.js';
import { resolveNextQuestion } from './question-resolver.js';
import { buildSystemPrompt, buildAnswerTool } from './prompt-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtocolEngineConfig {
  llmClient: LLMClient;
  questionnaire: Questionnaire;
  authority?: string;
  respondent?: string;
  audit?: (event: Record<string, unknown>) => void;
}

export interface ProtocolEngine {
  /** Start the interaction — returns first message to send to user. */
  start(): Promise<string>;
  /** Process an incoming user message — returns response or null if complete. */
  handleMessage(text: string): Promise<string | null>;
  /** Check if the questionnaire is complete. */
  isComplete(): boolean;
  /** Get the session with all validated answers. */
  getSession(): InteractionSession;
  /** Get validated answers as a plain object. */
  getAnswers(): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VALIDATION_RETRIES = 3;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProtocolEngine(config: ProtocolEngineConfig): ProtocolEngine {
  const { llmClient, questionnaire, audit } = config;
  let session = createSession(questionnaire.id ?? questionnaire.provider_type);
  let currentQuestion: Question | null = null;
  let validationRetries = 0;
  let lastValidationError: string | undefined;

  function logAudit(event: Record<string, unknown>): void {
    if (audit) audit({ session_id: session.session_id, ...event });
  }

  function countApplicableQuestions(): number {
    // Rough count — exact depends on conditional logic during execution
    return questionnaire.questions.length;
  }

  function getQuestionIndex(question: Question): number {
    return questionnaire.questions.findIndex((q) => q.id === question.id);
  }

  async function promptLLM(question: Question, userMessage?: string): Promise<string> {
    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      questionnaire,
      question,
      validationError: lastValidationError,
      questionIndex: getQuestionIndex(question),
      totalQuestions: countApplicableQuestions(),
    });

    // Build tool
    const answerTool = buildAnswerTool(question);

    // Build messages — include conversation history + optional new user message
    const messages: LLMMessage[] = [...session.conversation_history];
    if (userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }

    // Ensure messages alternate roles and start with user
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: 'Hello, I am ready to begin the questionnaire.',
      });
    }

    // Call LLM
    const response = await llmClient.chat({
      system: systemPrompt,
      messages,
      tools: [answerTool],
      tool_choice: { type: 'auto' },
    });

    // Process response
    const toolUse = response.content.find(
      (block): block is Extract<LLMContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use' && block.name === 'submit_answer',
    );

    const textBlocks = response.content.filter(
      (block): block is Extract<LLMContentBlock, { type: 'text' }> =>
        block.type === 'text',
    );

    if (toolUse) {
      const input = toolUse.input as { value: unknown; display_text: string };
      const rawValue = typeof input.value === 'string' ? input.value : String(input.value);

      // Validate deterministically
      const result = validateAnswer(question, rawValue);

      if (result.valid) {
        // Accept answer
        advanceSession(session, question.id, result.value);
        lastValidationError = undefined;
        validationRetries = 0;

        logAudit({
          event: 'answer_accepted',
          question_id: question.id,
          answer_type: question.answer_type,
        });

        // Add assistant response to history
        session.conversation_history.push({
          role: 'assistant',
          content: response.content,
        });

        // Add tool result to history
        session.conversation_history.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Answer accepted.',
          }],
        });

        // Check if questionnaire is complete
        const nextQ = resolveNextQuestion(questionnaire, session);
        if (!nextQ) {
          completeSession(session);
          logAudit({ event: 'session_completed' });
          return input.display_text + '\n\nAll questions have been answered. Thank you!';
        }

        // Advance to next question
        currentQuestion = nextQ;
        session.current_question_id = nextQ.id;

        return input.display_text;
      } else {
        // Validation failed — re-prompt
        validationRetries++;
        lastValidationError = result.error ?? 'Invalid answer';

        logAudit({
          event: 'answer_rejected',
          question_id: question.id,
          error: lastValidationError,
          retry: validationRetries,
        });

        if (validationRetries >= MAX_VALIDATION_RETRIES) {
          failSession(session, `Max retries exceeded for question "${question.id}"`);
          logAudit({ event: 'session_failed', reason: 'max_retries' });
          throw new Error(`Max validation retries (${MAX_VALIDATION_RETRIES}) exceeded for question "${question.id}"`);
        }

        // Add assistant response to history
        session.conversation_history.push({
          role: 'assistant',
          content: response.content,
        });

        // Add tool result with error to history
        session.conversation_history.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Validation error: ${lastValidationError}. Please ask the user to try again.`,
          }],
        });

        // Re-prompt LLM with error context
        return promptLLM(question);
      }
    }

    // No tool use — conversational response
    const displayText = textBlocks.map((b) => b.text).join('\n');

    // Add to history
    if (userMessage) {
      // User message was already added to messages above but not to session history
      session.conversation_history.push({ role: 'user', content: userMessage });
    }
    session.conversation_history.push({ role: 'assistant', content: displayText });

    return displayText;
  }

  return {
    async start(): Promise<string> {
      session.status = 'active';

      currentQuestion = resolveNextQuestion(questionnaire, session);
      if (!currentQuestion) {
        completeSession(session);
        return 'This questionnaire has no applicable questions. You are all set!';
      }

      session.current_question_id = currentQuestion.id;
      logAudit({ event: 'session_started', questionnaire_id: session.questionnaire_id });

      return promptLLM(currentQuestion);
    },

    async handleMessage(text: string): Promise<string | null> {
      if (session.status === 'completed') return null;
      if (session.status === 'failed') return null;

      if (!currentQuestion) {
        currentQuestion = resolveNextQuestion(questionnaire, session);
        if (!currentQuestion) {
          completeSession(session);
          return null;
        }
        session.current_question_id = currentQuestion.id;
      }

      return promptLLM(currentQuestion, text);
    },

    isComplete(): boolean {
      return session.status === 'completed';
    },

    getSession(): InteractionSession {
      return session;
    },

    getAnswers(): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const [key, value] of session.answers) {
        result[key] = value;
      }
      return result;
    },
  };
}
