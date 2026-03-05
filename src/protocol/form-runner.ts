/**
 * Deterministic form runner — drives a single questionnaire through Axon's
 * form engine (POST /v1/forms/next, POST /v1/forms/validate) and renders
 * questions on Telegram with inline keyboards.
 *
 * No LLM involvement — all question ordering, validation, pagination, and
 * conditional logic are handled server-side by Axon.
 */

import type { AxonClient } from '../axon/types.js';
import type { AxonRenderedQuestion, AxonFormState } from '../axon/types.js';
import type {
  TelegramTransport,
  TelegramUpdate,
  InlineKeyboardMarkup,
} from '../bot/telegram-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormRunnerConfig {
  axonClient: AxonClient;
  transport: TelegramTransport;
  chatId: number;
  questionnaireId: string;
  context: Record<string, unknown>;
  audit?: (event: Record<string, unknown>) => void;
}

export interface FormRunnerResult {
  success: boolean;
  answers: Record<string, string | number | boolean | string[]>;
  artifacts?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VALIDATION_RETRIES = 3;
const INPUT_TIMEOUT_MS = 120_000; // 2 minutes
const POLL_TIMEOUT_S = 5; // Telegram long-poll timeout in seconds

// ---------------------------------------------------------------------------
// Inline keyboard construction
// ---------------------------------------------------------------------------

function buildKeyboard(question: AxonRenderedQuestion): InlineKeyboardMarkup | undefined {
  if (question.answer_type === 'boolean') {
    return {
      inline_keyboard: [[
        { text: 'Yes', callback_data: 'true' },
        { text: 'No', callback_data: 'false' },
      ]],
    };
  }

  if (question.answer_type === 'single_select' && question.options) {
    const rows = question.options.map((opt) => [
      { text: opt.label, callback_data: opt.value },
    ]);
    if (question.pagination?.has_more) {
      rows.push([{ text: 'More choices →', callback_data: '__page_next' }]);
    }
    return { inline_keyboard: rows };
  }

  return undefined; // text/number/date/multi_select — no keyboard
}

// ---------------------------------------------------------------------------
// Question rendering
// ---------------------------------------------------------------------------

function formatQuestionText(
  question: AxonRenderedQuestion,
  progress: { current: number; total: number },
): string {
  let text = `[${progress.current}/${progress.total}] ${question.text}`;

  if (question.answer_type === 'multi_select') {
    text += '\n\nPlease reply with comma-separated values.';
  } else if (question.answer_type === 'text') {
    text += '\n\nPlease type your answer.';
  } else if (question.answer_type === 'number') {
    text += '\n\nPlease enter a number.';
  } else if (question.answer_type === 'date') {
    text += '\n\nPlease enter a date (YYYY-MM-DD).';
  }

  return text;
}

// ---------------------------------------------------------------------------
// Update polling — extract relevant input from Telegram updates
// ---------------------------------------------------------------------------

interface UserInput {
  value: string;
  callbackQueryId?: string;
}

async function waitForInput(
  transport: TelegramTransport,
  chatId: number,
  currentOffset: { value: number },
  bufferedUpdates: TelegramUpdate[],
): Promise<UserInput> {
  const deadline = Date.now() + INPUT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    // Drain buffer first, then poll for new updates
    let updates: TelegramUpdate[];
    if (bufferedUpdates.length > 0) {
      updates = bufferedUpdates.splice(0, bufferedUpdates.length);
    } else {
      updates = await transport.getUpdates(
        currentOffset.value || undefined,
        POLL_TIMEOUT_S,
      );
    }

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];

      // Advance offset past this update
      if (update.update_id >= currentOffset.value) {
        currentOffset.value = update.update_id + 1;
      }

      // Callback query (inline keyboard button press)
      if (update.callback_query) {
        const cq = update.callback_query;
        if (cq.message?.chat.id === chatId && cq.data !== undefined) {
          // Buffer remaining updates for next call
          bufferedUpdates.push(...updates.slice(i + 1));
          return { value: cq.data, callbackQueryId: cq.id };
        }
      }

      // Text message
      if (update.message?.chat.id === chatId && update.message.text) {
        // Buffer remaining updates for next call
        bufferedUpdates.push(...updates.slice(i + 1));
        return { value: update.message.text };
      }
    }
  }

  throw new Error('Input timeout — no response received within 2 minutes.');
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runDeterministicQuestionnaire(
  config: FormRunnerConfig,
): Promise<FormRunnerResult> {
  const { axonClient, transport, chatId, questionnaireId, context, audit } = config;

  const answers: Record<string, string | number | boolean | string[]> = {};
  const currentOffset = { value: 0 };
  const bufferedUpdates: TelegramUpdate[] = [];

  function logAudit(event: Record<string, unknown>): void {
    if (audit) audit({ questionnaire_id: questionnaireId, ...event });
  }

  // Initialize: get first question
  const state: AxonFormState = {
    questionnaire_id: questionnaireId,
    answers,
    context,
  };

  let response = await axonClient.postFormNext(state);

  // Question loop
  while (response.status === 'question') {
    const question = response.question;
    if (!question) {
      return { success: false, answers, error: 'Form engine returned question status without a question.' };
    }

    const progress = response.progress;
    let retries = 0;
    let answered = false;

    while (!answered) {
      // Render question
      const text = formatQuestionText(question, progress);
      const keyboard = buildKeyboard(question);
      await transport.sendMessage(chatId, text, keyboard);

      logAudit({
        event: 'question_rendered',
        question_id: question.id,
        answer_type: question.answer_type,
        has_keyboard: !!keyboard,
      });

      // Wait for user input
      const input = await waitForInput(transport, chatId, currentOffset, bufferedUpdates);

      // Dismiss inline keyboard spinner
      if (input.callbackQueryId) {
        await transport.answerCallbackQuery(input.callbackQueryId);
      }

      // Handle pagination
      if (input.value === '__page_next') {
        state.page = (state.page ?? 1) + 1;
        const pageResponse = await axonClient.postFormNext(state);
        if (pageResponse.status === 'question' && pageResponse.question) {
          // Re-render with new page — update question in outer scope
          Object.assign(question, pageResponse.question);
        }
        continue;
      }

      // Validate
      const validation = await axonClient.postFormValidate({
        questionnaire_id: questionnaireId,
        question_id: question.id,
        value: input.value,
        context,
      });

      if (validation.valid) {
        // Store validated value
        answers[question.id] = validation.value ?? input.value;
        answered = true;

        logAudit({
          event: 'answer_accepted',
          question_id: question.id,
          answer_type: question.answer_type,
        });
      } else {
        retries++;

        logAudit({
          event: 'answer_rejected',
          question_id: question.id,
          error: validation.error,
          retry: retries,
        });

        if (retries >= MAX_VALIDATION_RETRIES) {
          return {
            success: false,
            answers,
            error: `Max validation retries (${MAX_VALIDATION_RETRIES}) exceeded for question "${question.id}": ${validation.error}`,
          };
        }

        await transport.sendMessage(
          chatId,
          `Invalid answer: ${validation.error ?? 'Please try again.'}`,
        );
        // Loop re-renders the question
      }
    }

    // Advance to next question
    state.page = undefined;
    state.answers = answers;
    response = await axonClient.postFormNext(state);
  }

  // Hard stop
  if (response.status === 'hard_stop') {
    const message = response.hard_stop?.message ?? 'Cannot proceed.';
    await transport.sendMessage(chatId, message);

    logAudit({ event: 'hard_stop', message });

    return { success: false, answers, error: message };
  }

  // Completed
  logAudit({ event: 'questionnaire_completed', answer_count: Object.keys(answers).length });

  return {
    success: true,
    answers,
    artifacts: response.artifacts,
  };
}
