/**
 * Tests for the deterministic form runner — Axon form engine + Telegram
 * inline keyboards, zero LLM involvement.
 */

import { describe, it, expect } from 'vitest';
import { runDeterministicQuestionnaire, type FormRunnerConfig } from '../../src/protocol/form-runner.js';
import { createMockTransport } from '../../src/bot/telegram-client.js';
import type { AxonClient } from '../../src/axon/types.js';
import type { AxonFormState, AxonFormNext, AxonFormValidateRequest, AxonFormValidateResult, AxonRenderedQuestion } from '../../src/axon/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<AxonRenderedQuestion> = {}): AxonRenderedQuestion {
  return {
    id: 'q1',
    text: 'Test question?',
    answer_type: 'boolean',
    required: true,
    classification: { domain: 'consent', sensitivity: 'low' },
    mode: 'deterministic',
    ...overrides,
  };
}

function makeFormNext(overrides: Partial<AxonFormNext> = {}): AxonFormNext {
  return {
    status: 'question',
    question: makeQuestion(),
    progress: { current: 1, total: 5 },
    ...overrides,
  };
}

interface MockAxonFormEngine {
  client: AxonClient;
  nextResponses: AxonFormNext[];
  validateResponses: AxonFormValidateResult[];
  nextCalls: AxonFormState[];
  validateCalls: AxonFormValidateRequest[];
}

function createMockAxonClient(
  nextResponses: AxonFormNext[],
  validateResponses: AxonFormValidateResult[],
): MockAxonFormEngine {
  const nextCalls: AxonFormState[] = [];
  const validateCalls: AxonFormValidateRequest[] = [];
  let nextIdx = 0;
  let valIdx = 0;

  const client: AxonClient = {
    async getProviderTypes() { return []; },
    async getQuestionnaire() { return {} as never; },
    async lookupNpi() { return {} as never; },
    async checkHealth() { return { status: 'ok', version: '1.0.0' }; },
    async postFormNext(state: AxonFormState): Promise<AxonFormNext> {
      nextCalls.push(state);
      const response = nextResponses[nextIdx];
      if (!response) throw new Error('Mock: no more postFormNext responses');
      nextIdx++;
      return response;
    },
    async postFormValidate(req: AxonFormValidateRequest): Promise<AxonFormValidateResult> {
      validateCalls.push(req);
      const response = validateResponses[valIdx];
      if (!response) throw new Error('Mock: no more postFormValidate responses');
      valIdx++;
      return response;
    },
  };

  return { client, nextResponses, validateResponses, nextCalls, validateCalls };
}

function makeConfig(
  mock: MockAxonFormEngine,
  transport: ReturnType<typeof createMockTransport>,
  overrides: Partial<FormRunnerConfig> = {},
): FormRunnerConfig {
  return {
    axonClient: mock.client,
    transport,
    chatId: 12345,
    questionnaireId: 'test-q',
    context: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Form Runner', () => {
  describe('Boolean question', () => {
    it('renders inline keyboard [Yes/No] and accepts callback_query "true"', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          // First call: return boolean question
          makeFormNext({
            question: makeQuestion({ id: 'consent_hipaa', text: 'Do you acknowledge HIPAA?' }),
            progress: { current: 1, total: 3 },
          }),
          // After valid answer: completed
          makeFormNext({ status: 'completed', question: undefined, progress: { current: 3, total: 3 } }),
        ],
        [
          // Validation: valid
          { valid: true, value: true },
        ],
      );

      // Queue callback query "true"
      transport.queueCallbackQuery({
        id: 'cq_1',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 1, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'true',
      });

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));

      expect(result.success).toBe(true);
      expect(result.answers['consent_hipaa']).toBe(true);

      // Verify inline keyboard was sent
      const messages = transport.getSentMessages();
      expect(messages.length).toBeGreaterThanOrEqual(1);
      const first = messages[0];
      expect(first.text).toContain('[1/3]');
      expect(first.text).toContain('Do you acknowledge HIPAA?');
      expect(first.replyMarkup).toBeDefined();
      expect(first.replyMarkup!.inline_keyboard[0]).toEqual([
        { text: 'Yes', callback_data: 'true' },
        { text: 'No', callback_data: 'false' },
      ]);

      // Verify answerCallbackQuery was called
      const cbCalls = transport.calls.filter(c => c.method === 'answerCallbackQuery');
      expect(cbCalls.length).toBe(1);
      expect(cbCalls[0].args[0]).toBe('cq_1');
    });
  });

  describe('Single select question', () => {
    it('renders option buttons and accepts callback_query', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          makeFormNext({
            question: makeQuestion({
              id: 'provider_type',
              text: 'What type of provider are you?',
              answer_type: 'single_select',
              options: [
                { value: 'physician', label: 'Physician' },
                { value: 'nurse', label: 'Nurse Practitioner' },
                { value: 'pa', label: 'Physician Assistant' },
              ],
            }),
            progress: { current: 2, total: 5 },
          }),
          makeFormNext({ status: 'completed', question: undefined, progress: { current: 5, total: 5 } }),
        ],
        [{ valid: true, value: 'physician' }],
      );

      transport.queueCallbackQuery({
        id: 'cq_2',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 1, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'physician',
      });

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));

      expect(result.success).toBe(true);
      expect(result.answers['provider_type']).toBe('physician');

      const messages = transport.getSentMessages();
      const keyboard = messages[0].replyMarkup!;
      expect(keyboard.inline_keyboard).toHaveLength(3);
      expect(keyboard.inline_keyboard[0][0]).toEqual({ text: 'Physician', callback_data: 'physician' });
      expect(keyboard.inline_keyboard[1][0]).toEqual({ text: 'Nurse Practitioner', callback_data: 'nurse' });
    });
  });

  describe('Text input question', () => {
    it('renders without keyboard and accepts message.text', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          makeFormNext({
            question: makeQuestion({
              id: 'provider_name',
              text: 'What is your full name?',
              answer_type: 'text',
            }),
            progress: { current: 1, total: 2 },
          }),
          makeFormNext({ status: 'completed', question: undefined, progress: { current: 2, total: 2 } }),
        ],
        [{ valid: true, value: 'Dr. Jane Smith' }],
      );

      // Queue text message
      transport.queueUpdates([{
        update_id: 1,
        message: {
          message_id: 10,
          chat: { id: 12345, type: 'private' },
          date: Date.now(),
          text: 'Dr. Jane Smith',
        },
      }]);

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));

      expect(result.success).toBe(true);
      expect(result.answers['provider_name']).toBe('Dr. Jane Smith');

      const messages = transport.getSentMessages();
      expect(messages[0].replyMarkup).toBeUndefined();
      expect(messages[0].text).toContain('Please type your answer.');
    });
  });

  describe('Pagination', () => {
    it('renders "More choices" button and re-renders page 2 on click', async () => {
      const transport = createMockTransport();
      const page1Options = Array.from({ length: 8 }, (_, i) => ({
        value: `type_${i}`, label: `Type ${i}`,
      }));
      const page2Options = [
        { value: 'type_8', label: 'Type 8' },
        { value: 'type_9', label: 'Type 9' },
      ];

      const mock = createMockAxonClient(
        [
          // Initial: page 1 with pagination
          makeFormNext({
            question: makeQuestion({
              id: 'specialty',
              text: 'Select your specialty:',
              answer_type: 'single_select',
              options: page1Options,
              pagination: { page: 1, total_pages: 2, has_more: true },
            }),
            progress: { current: 3, total: 5 },
          }),
          // After page_next: page 2
          makeFormNext({
            question: makeQuestion({
              id: 'specialty',
              text: 'Select your specialty:',
              answer_type: 'single_select',
              options: page2Options,
              pagination: { page: 2, total_pages: 2, has_more: false },
            }),
            progress: { current: 3, total: 5 },
          }),
          // After valid answer: completed
          makeFormNext({ status: 'completed', question: undefined, progress: { current: 5, total: 5 } }),
        ],
        [{ valid: true, value: 'type_9' }],
      );

      // First: click "More choices"
      transport.queueCallbackQuery({
        id: 'cq_page',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 1, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: '__page_next',
      });

      // Then: select from page 2
      transport.queueCallbackQuery({
        id: 'cq_select',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 2, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'type_9',
      });

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));

      expect(result.success).toBe(true);
      expect(result.answers['specialty']).toBe('type_9');

      // First render should have "More choices →" button
      const messages = transport.getSentMessages();
      const firstKeyboard = messages[0].replyMarkup!;
      const lastRow = firstKeyboard.inline_keyboard[firstKeyboard.inline_keyboard.length - 1];
      expect(lastRow[0].text).toBe('More choices →');
      expect(lastRow[0].callback_data).toBe('__page_next');

      // Second render (page 2) should NOT have "More choices →"
      const secondKeyboard = messages[1].replyMarkup!;
      expect(secondKeyboard.inline_keyboard).toHaveLength(2);
      const secondLastRow = secondKeyboard.inline_keyboard[secondKeyboard.inline_keyboard.length - 1];
      expect(secondLastRow[0].text).toBe('Type 9');
    });
  });

  describe('Validation failure', () => {
    it('sends error message and re-renders question (max 3 retries)', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          makeFormNext({
            question: makeQuestion({
              id: 'npi',
              text: 'Enter your NPI:',
              answer_type: 'text',
            }),
            progress: { current: 1, total: 1 },
          }),
          // After 3 failures, never reaches next
        ],
        [
          { valid: false, error: 'NPI must be 10 digits' },
          { valid: false, error: 'NPI must be 10 digits' },
          { valid: false, error: 'NPI must be 10 digits' },
        ],
      );

      // Queue 3 invalid attempts
      for (let i = 0; i < 3; i++) {
        transport.queueUpdates([{
          update_id: 10 + i,
          message: {
            message_id: 20 + i,
            chat: { id: 12345, type: 'private' },
            date: Date.now(),
            text: '123', // too short
          },
        }]);
      }

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max validation retries');
      expect(result.error).toContain('npi');

      // Error messages sent after retries 1 and 2; retry 3 returns failure immediately
      const messages = transport.getSentMessages();
      const errorMessages = messages.filter(m => m.text.includes('Invalid answer'));
      expect(errorMessages.length).toBe(2);
    });
  });

  describe('Hard stop', () => {
    it('returns failure when Axon returns hard_stop', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          makeFormNext({
            status: 'hard_stop',
            question: undefined,
            hard_stop: { message: 'Consent is required to proceed.' },
            progress: { current: 1, total: 3 },
          }),
        ],
        [],
      );

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Consent is required to proceed.');

      // Should have sent the hard stop message to user
      const messages = transport.getSentMessages();
      expect(messages.some(m => m.text.includes('Consent is required'))).toBe(true);
    });
  });

  describe('Completion', () => {
    it('returns success with answers and artifacts', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          makeFormNext({
            question: makeQuestion({
              id: 'consent_hipaa',
              text: 'HIPAA acknowledged?',
              answer_type: 'boolean',
            }),
            progress: { current: 1, total: 2 },
          }),
          makeFormNext({
            question: makeQuestion({
              id: 'consent_audit',
              text: 'Audit consent?',
              answer_type: 'boolean',
            }),
            progress: { current: 2, total: 2 },
          }),
          makeFormNext({
            status: 'completed',
            question: undefined,
            progress: { current: 2, total: 2 },
            artifacts: { consent_timestamp: '2026-03-04T12:00:00Z' },
          }),
        ],
        [
          { valid: true, value: true },
          { valid: true, value: true },
        ],
      );

      // Queue two "Yes" answers
      transport.queueCallbackQuery({
        id: 'cq_a',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 1, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'true',
      });
      transport.queueCallbackQuery({
        id: 'cq_b',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 2, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'true',
      });

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));

      expect(result.success).toBe(true);
      expect(result.answers).toEqual({
        consent_hipaa: true,
        consent_audit: true,
      });
      expect(result.artifacts).toEqual({ consent_timestamp: '2026-03-04T12:00:00Z' });
    });
  });

  describe('Progress prefix', () => {
    it('prepends [current/total] to question text', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          makeFormNext({
            question: makeQuestion({ text: 'First question?' }),
            progress: { current: 1, total: 5 },
          }),
          makeFormNext({ status: 'completed', question: undefined, progress: { current: 5, total: 5 } }),
        ],
        [{ valid: true, value: true }],
      );

      transport.queueCallbackQuery({
        id: 'cq_1',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 1, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'true',
      });

      await runDeterministicQuestionnaire(makeConfig(mock, transport));

      const messages = transport.getSentMessages();
      expect(messages[0].text).toMatch(/^\[1\/5\] First question\?/);
    });
  });

  describe('Audit logging', () => {
    it('emits question_rendered, answer_accepted, and questionnaire_completed events', async () => {
      const transport = createMockTransport();
      const auditEvents: Record<string, unknown>[] = [];
      const mock = createMockAxonClient(
        [
          makeFormNext({
            question: makeQuestion({ id: 'q1' }),
            progress: { current: 1, total: 1 },
          }),
          makeFormNext({ status: 'completed', question: undefined, progress: { current: 1, total: 1 } }),
        ],
        [{ valid: true, value: true }],
      );

      transport.queueCallbackQuery({
        id: 'cq_1',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 1, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'true',
      });

      await runDeterministicQuestionnaire(
        makeConfig(mock, transport, { audit: (e) => auditEvents.push(e) }),
      );

      const events = auditEvents.map(e => e.event);
      expect(events).toContain('question_rendered');
      expect(events).toContain('answer_accepted');
      expect(events).toContain('questionnaire_completed');
    });
  });

  describe('Ignores updates from other chats', () => {
    it('skips messages from wrong chatId and processes correct one', async () => {
      const transport = createMockTransport();
      const mock = createMockAxonClient(
        [
          makeFormNext({
            question: makeQuestion({ id: 'q1', text: 'Confirm?', answer_type: 'boolean' }),
            progress: { current: 1, total: 1 },
          }),
          makeFormNext({ status: 'completed', question: undefined, progress: { current: 1, total: 1 } }),
        ],
        [{ valid: true, value: true }],
      );

      // Queue update from wrong chat, then correct chat
      transport.queueUpdates([
        {
          update_id: 1,
          message: {
            message_id: 1,
            chat: { id: 99999, type: 'private' },
            date: Date.now(),
            text: 'wrong chat',
          },
        },
      ]);
      transport.queueCallbackQuery({
        id: 'cq_right',
        from: { id: 99, is_bot: false, first_name: 'Dr' },
        message: { message_id: 2, chat: { id: 12345, type: 'private' }, date: Date.now() },
        data: 'true',
      });

      const result = await runDeterministicQuestionnaire(makeConfig(mock, transport));
      expect(result.success).toBe(true);
    });
  });
});
