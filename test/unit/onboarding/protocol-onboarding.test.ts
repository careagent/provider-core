/**
 * Unit tests for protocol-based onboarding — single-questionnaire flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runProtocolOnboarding, parseProviderType } from '../../../src/onboarding/protocol-onboarding.js';
import { createMockMessageIO } from '../../../src/protocol/message-io.js';
import type { LLMClient, LLMResponse, LLMContentBlock } from '../../../src/protocol/llm-client.js';
import type { Questionnaire } from '@careagent/axon/types';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolUseResponse(
  value: unknown,
  displayText: string,
  toolUseId: string,
): LLMResponse {
  return {
    id: 'msg_test',
    content: [{
      type: 'tool_use',
      id: toolUseId,
      name: 'submit_answer',
      input: { value, display_text: displayText },
    } as LLMContentBlock],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function createSequenceMockLLM(responses: LLMResponse[]): LLMClient {
  let idx = 0;
  return {
    async chat() {
      const r = responses[idx];
      if (!r) throw new Error(`Mock LLM: no response at index ${idx}`);
      idx++;
      return r;
    },
  };
}

/** Minimal questionnaire that produces a valid CANS document. */
function makeMinimalQuestionnaire(): Questionnaire {
  return {
    id: 'test-minimal',
    provider_type: 'physician',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Test Minimal',
    description: 'Minimal questionnaire for testing',
    questions: [
      {
        id: 'provider_name',
        text: 'What is your name?',
        answer_type: 'text',
        required: true,
        cans_field: 'provider.name',
      },
      {
        id: 'organization_name',
        text: 'Organization name?',
        answer_type: 'text',
        required: true,
        cans_field: 'provider.organizations',
      },
      {
        id: 'clinical_charting',
        text: 'Do you chart?',
        answer_type: 'boolean',
        required: true,
        cans_field: 'scope.permitted_actions',
        action_assignments: [
          { answer_value: 'true', grants: ['chart.progress_note'] },
        ],
      },
      {
        id: 'consent_hipaa',
        text: 'HIPAA acknowledged?',
        answer_type: 'boolean',
        required: true,
        cans_field: 'consent.hipaa_warning_acknowledged',
      },
      {
        id: 'consent_synthetic',
        text: 'Synthetic data confirmed?',
        answer_type: 'boolean',
        required: true,
        cans_field: 'consent.synthetic_data_only',
      },
      {
        id: 'consent_audit',
        text: 'Audit consent?',
        answer_type: 'boolean',
        required: true,
        cans_field: 'consent.audit_consent',
      },
    ],
  } as Questionnaire;
}

/** Mock fetch to return a questionnaire for any /v1/questionnaires/ URL. */
function mockFetchForQuestionnaire(questionnaire: Questionnaire): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => questionnaire,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseProviderType', () => {
  it('parses numeric selection', () => {
    expect(parseProviderType('1')).toBe('physician');
    expect(parseProviderType('3')).toBe('nursing');
    expect(parseProviderType('8')).toBe('other');
  });

  it('parses exact id', () => {
    expect(parseProviderType('physician')).toBe('physician');
    expect(parseProviderType('nursing')).toBe('nursing');
  });

  it('parses label substring', () => {
    expect(parseProviderType('Physician')).toBe('physician');
    expect(parseProviderType('pharmacy')).toBe('pharmacy');
    expect(parseProviderType('Mental Health')).toBe('behavioral_mental_health');
  });

  it('returns undefined for invalid input', () => {
    expect(parseProviderType('99')).toBeUndefined();
    expect(parseProviderType('xyz')).toBeUndefined();
    expect(parseProviderType('0')).toBeUndefined();
  });
});

describe('Protocol Onboarding', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'protocol-onboarding-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs single-questionnaire onboarding flow', async () => {
    const questionnaire = makeMinimalQuestionnaire();
    mockFetchForQuestionnaire(questionnaire);

    // 6 questions → 6 LLM responses
    const llmResponses: LLMResponse[] = [
      makeToolUseResponse('Dr. Test', 'Name recorded', 'tu_1'),
      makeToolUseResponse('Test Clinic', 'Org recorded', 'tu_2'),
      makeToolUseResponse(true, 'Charting: yes', 'tu_3'),
      makeToolUseResponse(true, 'HIPAA ack', 'tu_4'),
      makeToolUseResponse(true, 'Synthetic confirmed', 'tu_5'),
      makeToolUseResponse(true, 'Audit consent', 'tu_6'),
    ];

    // User responses: 1 for provider type + 5 for remaining questions (Q1 handled by start())
    const userResponses = [
      '1', // provider type = physician
      'Dr. Test', 'Test Clinic', 'yes', 'yes', 'yes', 'yes',
    ];

    const mockIO = createMockMessageIO(userResponses);

    const result = await runProtocolOnboarding({
      llmClient: createSequenceMockLLM(llmResponses),
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    // Verify messages were sent
    const sent = mockIO.getSentMessages();
    expect(sent.length).toBeGreaterThan(0);
    // First message should be provider type prompt
    expect(sent[0]).toContain('What is your provider type');
  });

  it('calls audit function with provider_type_selected event', async () => {
    const questionnaire = makeMinimalQuestionnaire();
    mockFetchForQuestionnaire(questionnaire);

    const auditFn = vi.fn();

    const llmResponses: LLMResponse[] = [
      makeToolUseResponse('Dr. Audit', 'Name', 'tu_1'),
      makeToolUseResponse('Clinic', 'Org', 'tu_2'),
      makeToolUseResponse(true, 'Chart', 'tu_3'),
      makeToolUseResponse(true, 'HIPAA', 'tu_4'),
      makeToolUseResponse(true, 'Synth', 'tu_5'),
      makeToolUseResponse(true, 'Audit', 'tu_6'),
    ];

    const mockIO = createMockMessageIO([
      '1', 'Dr. Audit', 'Clinic', 'yes', 'yes', 'yes', 'yes',
    ]);

    await runProtocolOnboarding({
      llmClient: createSequenceMockLLM(llmResponses),
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      audit: auditFn,
    });

    const typeEvent = auditFn.mock.calls.find(
      (call: [Record<string, unknown>]) => call[0].event === 'provider_type_selected',
    );
    expect(typeEvent).toBeDefined();
    expect(typeEvent![0].provider_type).toBe('physician');
  });

  it('retries provider type selection up to 3 times', async () => {
    mockFetchForQuestionnaire(makeMinimalQuestionnaire());

    // User gives 3 bad responses
    const mockIO = createMockMessageIO(['xyz', 'abc', '999']);

    const result = await runProtocolOnboarding({
      llmClient: { async chat() { throw new Error('should not reach LLM'); } },
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not determine provider type');
  });

  it('handles LLM failure gracefully', async () => {
    mockFetchForQuestionnaire(makeMinimalQuestionnaire());

    const failingLLM: LLMClient = {
      async chat() { throw new Error('LLM connection refused'); },
    };

    const mockIO = createMockMessageIO(['1', 'anything']);

    const result = await runProtocolOnboarding({
      llmClient: failingLLM,
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM connection refused');

    const sent = mockIO.getSentMessages();
    expect(sent.some((m) => m.includes('Onboarding failed'))).toBe(true);
  });

  it('handles Axon fetch failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    const mockIO = createMockMessageIO(['1']);

    const result = await runProtocolOnboarding({
      llmClient: { async chat() { throw new Error('should not reach LLM'); } },
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to fetch questionnaire from Axon');
  });
});
