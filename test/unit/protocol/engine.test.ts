/**
 * Tests for protocol engine — full flow with mock LLM, multi-turn,
 * validation retries, completion detection.
 */

import { describe, it, expect, vi } from 'vitest';
import { createProtocolEngine } from '../../../src/protocol/engine.js';
import type { LLMClient, LLMResponse, LLMContentBlock } from '../../../src/protocol/llm-client.js';
import type { Questionnaire } from '@careagent/axon/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestionnaire(questions: unknown[]): Questionnaire {
  return {
    id: 'test-questionnaire',
    provider_type: 'test',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Test Questionnaire',
    description: 'A test questionnaire',
    questions,
  } as Questionnaire;
}

function makeToolUseResponse(
  value: unknown,
  displayText: string,
  toolUseId = 'tu_123',
): LLMResponse {
  return {
    id: 'msg_test',
    content: [
      {
        type: 'tool_use',
        id: toolUseId,
        name: 'submit_answer',
        input: { value, display_text: displayText },
      } as LLMContentBlock,
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function makeTextResponse(text: string): LLMResponse {
  return {
    id: 'msg_test',
    content: [{ type: 'text', text } as LLMContentBlock],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function createMockLLMClient(responses: LLMResponse[]): LLMClient {
  let callIdx = 0;
  return {
    async chat() {
      const response = responses[callIdx];
      if (!response) throw new Error('Mock LLM: no more responses');
      callIdx++;
      return response;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Protocol Engine', () => {
  it('starts and presents first question', async () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Yes or no?', answer_type: 'boolean', required: true },
    ]);

    const mockClient = createMockLLMClient([
      makeToolUseResponse('true', 'Great, you confirmed!'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    const result = await engine.start();
    expect(result).toContain('Great, you confirmed!');
    expect(engine.isComplete()).toBe(true);
  });

  it('handles multi-turn conversation', async () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Yes or no?', answer_type: 'boolean', required: true },
      { id: 'q2', text: 'Name?', answer_type: 'text', required: true },
    ]);

    const mockClient = createMockLLMClient([
      makeToolUseResponse('true', 'Got it, yes!'),
      makeToolUseResponse('Dr. Smith', 'Thanks Dr. Smith!'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    await engine.start();
    expect(engine.isComplete()).toBe(false);

    const result = await engine.handleMessage('My name is Dr. Smith');
    expect(result).toContain('Dr. Smith');
    expect(engine.isComplete()).toBe(true);
  });

  it('validates answers deterministically', async () => {
    const q = makeQuestionnaire([
      {
        id: 'q1',
        text: 'Select one',
        answer_type: 'single_select',
        required: true,
        options: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
    ]);

    const mockClient = createMockLLMClient([
      // First call: invalid answer
      makeToolUseResponse('invalid', 'You said invalid', 'tu_1'),
      // Re-prompt: valid answer
      makeToolUseResponse('a', 'You selected Option A', 'tu_2'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    const result = await engine.start();
    expect(result).toContain('Option A');
    expect(engine.isComplete()).toBe(true);
    expect(engine.getAnswers()['q1']).toBe('a');
  });

  it('fails after max validation retries', async () => {
    const q = makeQuestionnaire([
      {
        id: 'q1',
        text: 'Pick one',
        answer_type: 'single_select',
        required: true,
        options: [{ value: 'a', label: 'A' }],
      },
    ]);

    // All 4 calls return invalid answers (3 retries = initial + 3 re-prompts)
    const mockClient = createMockLLMClient([
      makeToolUseResponse('bad1', 'try 1', 'tu_1'),
      makeToolUseResponse('bad2', 'try 2', 'tu_2'),
      makeToolUseResponse('bad3', 'try 3', 'tu_3'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    await expect(engine.start()).rejects.toThrow('Max validation retries');
    expect(engine.getSession().status).toBe('failed');
  });

  it('handles conditional questions', async () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Prescribing?', answer_type: 'boolean', required: true },
      {
        id: 'q2',
        text: 'DEA number?',
        answer_type: 'text',
        required: true,
        show_when: { question_id: 'q1', equals: 'true' },
        validation: { pattern: '^[A-Z]{2}\\d{7}$' },
      },
      { id: 'q3', text: 'Done?', answer_type: 'boolean', required: true },
    ]);

    const mockClient = createMockLLMClient([
      // q1: false — DEA question should be skipped
      makeToolUseResponse('false', 'No prescribing'),
      // q3: directly (q2 skipped)
      makeToolUseResponse('true', 'All done'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    await engine.start();
    const result = await engine.handleMessage('Yes, done');
    expect(result).toContain('All done');
    expect(engine.isComplete()).toBe(true);
    expect(engine.getAnswers()['q2']).toBeUndefined();
  });

  it('handles conversational (text-only) LLM response', async () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Name?', answer_type: 'text', required: true },
    ]);

    const mockClient = createMockLLMClient([
      makeTextResponse("I'd be happy to help! What is your full name?"),
      makeToolUseResponse('Dr. Anderson', 'Nice to meet you, Dr. Anderson!'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    const firstResponse = await engine.start();
    expect(firstResponse).toContain('full name');
    expect(engine.isComplete()).toBe(false);

    const secondResponse = await engine.handleMessage('Thomas Anderson');
    expect(secondResponse).toContain('Dr. Anderson');
    expect(engine.isComplete()).toBe(true);
  });

  it('returns null on handleMessage when already complete', async () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Yes?', answer_type: 'boolean', required: true },
    ]);

    const mockClient = createMockLLMClient([
      makeToolUseResponse('true', 'Done!'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    await engine.start();
    expect(engine.isComplete()).toBe(true);

    const result = await engine.handleMessage('more stuff');
    expect(result).toBeNull();
  });

  it('handles empty questionnaire', async () => {
    const q = makeQuestionnaire([]);

    const mockClient = createMockLLMClient([]);
    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    const result = await engine.start();
    expect(result).toContain('no applicable questions');
    expect(engine.isComplete()).toBe(true);
  });

  it('collects all answers in getAnswers()', async () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Bool?', answer_type: 'boolean', required: true },
      { id: 'q2', text: 'Text?', answer_type: 'text', required: true },
      { id: 'q3', text: 'Num?', answer_type: 'number', required: true },
    ]);

    const mockClient = createMockLLMClient([
      makeToolUseResponse('true', 'q1 done'),
      makeToolUseResponse('hello', 'q2 done'),
      makeToolUseResponse('42', 'q3 done'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    await engine.start();
    await engine.handleMessage('hello');
    await engine.handleMessage('42');

    const answers = engine.getAnswers();
    expect(answers['q1']).toBe(true);
    expect(answers['q2']).toBe('hello');
    expect(answers['q3']).toBe(42);
  });

  it('calls audit function on events', async () => {
    const q = makeQuestionnaire([
      { id: 'q1', text: 'Yes?', answer_type: 'boolean', required: true },
    ]);

    const auditFn = vi.fn();
    const mockClient = createMockLLMClient([
      makeToolUseResponse('true', 'Done'),
    ]);

    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
      audit: auditFn,
    });

    await engine.start();

    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'session_started' }),
    );
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'answer_accepted', question_id: 'q1' }),
    );
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'session_completed' }),
    );
  });

  it('session has UUIDv7 format', async () => {
    const q = makeQuestionnaire([]);
    const mockClient = createMockLLMClient([]);
    const engine = createProtocolEngine({
      llmClient: mockClient,
      questionnaire: q,
    });

    const session = engine.getSession();
    expect(session.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  // -------------------------------------------------------------------------
  // Structured mode — deterministic, no LLM
  // -------------------------------------------------------------------------

  describe('structured mode', () => {
    it('presents boolean question text directly without LLM', async () => {
      const q = makeQuestionnaire([
        { id: 'q1', text: 'Do you acknowledge HIPAA?', answer_type: 'boolean', required: true, mode: 'deterministic' },
      ]);

      // LLM should never be called — use a mock that throws
      const mockClient: LLMClient = {
        async chat() { throw new Error('LLM should not be called for structured mode'); },
      };

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q });
      const result = await engine.start();

      expect(result).toContain('Do you acknowledge HIPAA?');
      expect(result).toContain('yes or no');
      expect(engine.isComplete()).toBe(false);
    });

    it('validates structured boolean answer and completes', async () => {
      const q = makeQuestionnaire([
        { id: 'q1', text: 'Consent?', answer_type: 'boolean', required: true, mode: 'deterministic' },
      ]);

      const mockClient: LLMClient = {
        async chat() { throw new Error('LLM should not be called'); },
      };

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q });
      await engine.start();

      const response = await engine.handleMessage('yes');
      expect(response).toBeNull();
      expect(engine.isComplete()).toBe(true);
      expect(engine.getAnswers()['q1']).toBe(true);
    });

    it('advances through multiple structured questions without LLM', async () => {
      const q = makeQuestionnaire([
        { id: 'q1', text: 'HIPAA?', answer_type: 'boolean', required: true, mode: 'deterministic' },
        { id: 'q2', text: 'Synthetic?', answer_type: 'boolean', required: true, mode: 'deterministic' },
        { id: 'q3', text: 'Audit?', answer_type: 'boolean', required: true, mode: 'deterministic' },
      ]);

      const mockClient: LLMClient = {
        async chat() { throw new Error('LLM should not be called'); },
      };

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q });
      const start = await engine.start();
      expect(start).toContain('[1/3]');
      expect(start).toContain('HIPAA?');

      const r1 = await engine.handleMessage('yes');
      expect(r1).toContain('[2/3]');
      expect(r1).toContain('Synthetic?');
      expect(engine.isComplete()).toBe(false);

      const r2 = await engine.handleMessage('yes');
      expect(r2).toContain('[3/3]');
      expect(r2).toContain('Audit?');
      expect(engine.isComplete()).toBe(false);

      const r3 = await engine.handleMessage('yes');
      expect(r3).toBeNull();
      expect(engine.isComplete()).toBe(true);

      const answers = engine.getAnswers();
      expect(answers['q1']).toBe(true);
      expect(answers['q2']).toBe(true);
      expect(answers['q3']).toBe(true);
    });

    it('presents single_select options as a list', async () => {
      const q = makeQuestionnaire([
        {
          id: 'q1', text: 'Provider type?', answer_type: 'single_select', required: true, mode: 'deterministic',
          options: [
            { value: 'physician', label: 'Physician', description: 'MD/DO' },
            { value: 'nursing', label: 'Nursing' },
          ],
        },
      ]);

      const mockClient: LLMClient = {
        async chat() { throw new Error('LLM should not be called'); },
      };

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q });
      const result = await engine.start();

      expect(result).toContain('Provider type?');
      expect(result).toContain('Physician');
      expect(result).toContain('MD/DO');
      expect(result).toContain('Nursing');
    });

    it('rejects invalid structured answer and re-presents question', async () => {
      const q = makeQuestionnaire([
        { id: 'q1', text: 'Consent?', answer_type: 'boolean', required: true, mode: 'deterministic' },
      ]);

      const mockClient: LLMClient = {
        async chat() { throw new Error('LLM should not be called'); },
      };

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q });
      await engine.start();

      const response = await engine.handleMessage('maybe');
      expect(response).toContain('Invalid answer');
      expect(response).toContain('Consent?');
      expect(engine.isComplete()).toBe(false);

      // Valid answer on retry
      const r2 = await engine.handleMessage('yes');
      expect(r2).toBeNull();
      expect(engine.isComplete()).toBe(true);
    });

    it('fails after max retries in structured mode', async () => {
      const q = makeQuestionnaire([
        { id: 'q1', text: 'Consent?', answer_type: 'boolean', required: true, mode: 'deterministic' },
      ]);

      const mockClient: LLMClient = {
        async chat() { throw new Error('LLM should not be called'); },
      };

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q });
      await engine.start();

      await engine.handleMessage('maybe');
      await engine.handleMessage('dunno');
      await expect(engine.handleMessage('nope-invalid')).rejects.toThrow('Max validation retries');
      expect(engine.getSession().status).toBe('failed');
    });

    it('transitions from structured to guided mode', async () => {
      const q = makeQuestionnaire([
        { id: 'q1', text: 'Consent?', answer_type: 'boolean', required: true, mode: 'deterministic' },
        { id: 'q2', text: 'Name?', answer_type: 'text', required: true },
      ]);

      const mockClient = createMockLLMClient([
        // LLM called only for q2 (guided mode)
        makeTextResponse('What is your full name?'),
      ]);

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q });
      const start = await engine.start();
      expect(start).toContain('Consent?');

      // Answer structured q1 → engine should call LLM for guided q2
      const r1 = await engine.handleMessage('yes');
      expect(r1).toContain('full name');
      expect(engine.isComplete()).toBe(false);
    });

    it('emits audit events for structured questions', async () => {
      const q = makeQuestionnaire([
        { id: 'q1', text: 'Consent?', answer_type: 'boolean', required: true, mode: 'deterministic' },
      ]);

      const auditFn = vi.fn();
      const mockClient: LLMClient = {
        async chat() { throw new Error('LLM should not be called'); },
      };

      const engine = createProtocolEngine({ llmClient: mockClient, questionnaire: q, audit: auditFn });
      await engine.start();
      await engine.handleMessage('yes');

      expect(auditFn).toHaveBeenCalledWith(expect.objectContaining({ event: 'session_started' }));
      expect(auditFn).toHaveBeenCalledWith(expect.objectContaining({ event: 'answer_accepted', question_id: 'q1' }));
      expect(auditFn).toHaveBeenCalledWith(expect.objectContaining({ event: 'session_completed' }));
    });
  });
});
