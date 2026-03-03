/**
 * Unit tests for protocol-based onboarding — flow-driven approach.
 *
 * Tests the 3-step flow: consent → provider type selection → type-specific questionnaire.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runProtocolOnboarding } from '../../../src/onboarding/protocol-onboarding.js';
import { createMockMessageIO } from '../../../src/protocol/message-io.js';
import type { LLMClient, LLMResponse, LLMContentBlock } from '../../../src/protocol/llm-client.js';
import type { Questionnaire } from '@careagent/axon/types';
import type { AxonOnboardingFlow } from '../../../src/axon/types.js';
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

/** The 3-step onboarding flow returned by Axon. */
const MOCK_FLOW: AxonOnboardingFlow = {
  target_type: 'provider',
  steps: [
    { questionnaire_id: '_universal_consent', label: 'Consent' },
    { questionnaire_id: '_provider_type_selection', label: 'Provider Type', routes_to_next: true, routing_question_id: 'provider_type' },
    { questionnaire_id: '{{provider_type}}', label: 'Onboarding Questionnaire' },
  ],
};

/** Universal consent questionnaire (3 boolean questions). */
function makeConsentQuestionnaire(): Questionnaire {
  return {
    id: 'universal-consent-v1',
    provider_type: '_universal_consent',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Universal Consent',
    description: 'Consent questions.',
    output_artifact: 'consent',
    questions: [
      { id: 'consent_hipaa', text: 'HIPAA acknowledged?', answer_type: 'boolean', required: true, cans_field: 'consent.hipaa_warning_acknowledged' },
      { id: 'consent_synthetic', text: 'Synthetic data confirmed?', answer_type: 'boolean', required: true, cans_field: 'consent.synthetic_data_only' },
      { id: 'consent_audit', text: 'Audit consent?', answer_type: 'boolean', required: true, cans_field: 'consent.audit_consent' },
    ],
  } as Questionnaire;
}

/** Provider type selection questionnaire (1 single_select question). */
function makeTypeSelectionQuestionnaire(): Questionnaire {
  return {
    id: 'provider-type-selection-v1',
    provider_type: '_provider_type_selection',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Provider Type Selection',
    description: 'Select provider type.',
    output_artifact: 'routing',
    questions: [
      {
        id: 'provider_type',
        text: 'What is your provider type?',
        answer_type: 'single_select',
        required: true,
        options: [
          { value: 'physician', label: 'Physician' },
          { value: 'nursing', label: 'Nursing' },
        ],
      },
    ],
  } as Questionnaire;
}

/** Minimal type-specific questionnaire. */
function makePhysicianQuestionnaire(): Questionnaire {
  return {
    id: 'test-physician',
    provider_type: 'physician',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Physician Onboarding',
    description: 'Physician-specific questions.',
    questions: [
      { id: 'provider_name', text: 'What is your name?', answer_type: 'text', required: true, cans_field: 'provider.name' },
      { id: 'organization_name', text: 'Organization name?', answer_type: 'text', required: true, cans_field: 'provider.organizations' },
      {
        id: 'clinical_charting', text: 'Do you chart?', answer_type: 'boolean', required: true,
        cans_field: 'scope.permitted_actions',
        action_assignments: [{ answer_value: 'true', grants: ['chart.progress_note'] }],
      },
      { id: 'autonomy_chart', text: 'Chart autonomy?', answer_type: 'single_select', required: true, cans_field: 'autonomy.chart', options: [{ value: 'autonomous', label: 'Autonomous' }, { value: 'supervised', label: 'Supervised' }, { value: 'manual', label: 'Manual' }] },
      { id: 'autonomy_order', text: 'Order autonomy?', answer_type: 'single_select', required: true, cans_field: 'autonomy.order', options: [{ value: 'autonomous', label: 'Autonomous' }, { value: 'supervised', label: 'Supervised' }, { value: 'manual', label: 'Manual' }] },
      { id: 'autonomy_charge', text: 'Charge autonomy?', answer_type: 'single_select', required: true, cans_field: 'autonomy.charge', options: [{ value: 'autonomous', label: 'Autonomous' }, { value: 'supervised', label: 'Supervised' }, { value: 'manual', label: 'Manual' }] },
      { id: 'autonomy_perform', text: 'Perform autonomy?', answer_type: 'single_select', required: true, cans_field: 'autonomy.perform', options: [{ value: 'autonomous', label: 'Autonomous' }, { value: 'supervised', label: 'Supervised' }, { value: 'manual', label: 'Manual' }] },
      { id: 'autonomy_interpret', text: 'Interpret autonomy?', answer_type: 'single_select', required: true, cans_field: 'autonomy.interpret', options: [{ value: 'autonomous', label: 'Autonomous' }, { value: 'supervised', label: 'Supervised' }, { value: 'manual', label: 'Manual' }] },
      { id: 'autonomy_educate', text: 'Educate autonomy?', answer_type: 'single_select', required: true, cans_field: 'autonomy.educate', options: [{ value: 'autonomous', label: 'Autonomous' }, { value: 'supervised', label: 'Supervised' }, { value: 'manual', label: 'Manual' }] },
      { id: 'autonomy_coordinate', text: 'Coordinate autonomy?', answer_type: 'single_select', required: true, cans_field: 'autonomy.coordinate', options: [{ value: 'autonomous', label: 'Autonomous' }, { value: 'supervised', label: 'Supervised' }, { value: 'manual', label: 'Manual' }] },
    ],
  } as Questionnaire;
}

/** Mock fetch that routes by URL pattern to serve flow + 3 questionnaires. */
function mockFetchForFlow(): void {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/v1/onboarding/flow/')) {
      return { ok: true, json: async () => MOCK_FLOW };
    }
    if (url.includes('/v1/questionnaires/_universal_consent')) {
      return { ok: true, json: async () => makeConsentQuestionnaire() };
    }
    if (url.includes('/v1/questionnaires/_provider_type_selection')) {
      return { ok: true, json: async () => makeTypeSelectionQuestionnaire() };
    }
    if (url.includes('/v1/questionnaires/physician')) {
      return { ok: true, json: async () => makePhysicianQuestionnaire() };
    }
    return { ok: false, status: 404 };
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Protocol Onboarding (flow-driven)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'protocol-onboarding-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs 3-step flow-driven onboarding', async () => {
    mockFetchForFlow();

    // 3 consent + 1 type selection + 10 physician = 14 LLM responses
    const llmResponses: LLMResponse[] = [
      // Consent
      makeToolUseResponse(true, 'HIPAA ack', 'tu_1'),
      makeToolUseResponse(true, 'Synthetic confirmed', 'tu_2'),
      makeToolUseResponse(true, 'Audit consent', 'tu_3'),
      // Type selection
      makeToolUseResponse('physician', 'Selected physician', 'tu_4'),
      // Physician questionnaire
      makeToolUseResponse('Dr. Test', 'Name recorded', 'tu_5'),
      makeToolUseResponse('Test Clinic', 'Org recorded', 'tu_6'),
      makeToolUseResponse(true, 'Charting: yes', 'tu_7'),
      makeToolUseResponse('autonomous', 'Chart: autonomous', 'tu_8'),
      makeToolUseResponse('supervised', 'Order: supervised', 'tu_9'),
      makeToolUseResponse('supervised', 'Charge: supervised', 'tu_10'),
      makeToolUseResponse('manual', 'Perform: manual', 'tu_11'),
      makeToolUseResponse('supervised', 'Interpret: supervised', 'tu_12'),
      makeToolUseResponse('autonomous', 'Educate: autonomous', 'tu_13'),
      makeToolUseResponse('supervised', 'Coordinate: supervised', 'tu_14'),
    ];

    // User responses: (questionCount - 1) per step for handleMessage calls
    // Consent: 3 questions → start() handles Q1, so 2 user messages
    // Type selection: 1 question → start() handles Q1, so 0 user messages
    // Physician: 10 questions → start() handles Q1, so 9 user messages
    // Total user messages: 2 + 0 + 9 = 11
    const userResponses = Array.from({ length: 11 }, () => 'yes');

    const mockIO = createMockMessageIO(userResponses);

    const result = await runProtocolOnboarding({
      llmClient: createSequenceMockLLM(llmResponses),
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(true);
    expect(result.cansPath).toBeDefined();
  });

  it('calls audit with provider_type_selected event from routing step', async () => {
    mockFetchForFlow();

    const llmResponses: LLMResponse[] = [
      makeToolUseResponse(true, 'HIPAA', 'tu_1'),
      makeToolUseResponse(true, 'Synth', 'tu_2'),
      makeToolUseResponse(true, 'Audit', 'tu_3'),
      makeToolUseResponse('physician', 'Type', 'tu_4'),
      makeToolUseResponse('Dr. Audit', 'Name', 'tu_5'),
      makeToolUseResponse('Clinic', 'Org', 'tu_6'),
      makeToolUseResponse(true, 'Chart', 'tu_7'),
      makeToolUseResponse('supervised', 'A1', 'tu_8'),
      makeToolUseResponse('supervised', 'A2', 'tu_9'),
      makeToolUseResponse('supervised', 'A3', 'tu_10'),
      makeToolUseResponse('manual', 'A4', 'tu_11'),
      makeToolUseResponse('supervised', 'A5', 'tu_12'),
      makeToolUseResponse('supervised', 'A6', 'tu_13'),
      makeToolUseResponse('supervised', 'A7', 'tu_14'),
    ];

    const auditFn = vi.fn();
    const mockIO = createMockMessageIO(Array.from({ length: 11 }, () => 'yes'));

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

  it('stops onboarding when consent is denied', async () => {
    mockFetchForFlow();

    // Consent step: first question answered false
    const llmResponses: LLMResponse[] = [
      makeToolUseResponse(false, 'HIPAA denied', 'tu_1'),
      makeToolUseResponse(true, 'Synth', 'tu_2'),
      makeToolUseResponse(true, 'Audit', 'tu_3'),
    ];

    const mockIO = createMockMessageIO(['no', 'yes']);

    const result = await runProtocolOnboarding({
      llmClient: createSequenceMockLLM(llmResponses),
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('consent');

    const sent = mockIO.getSentMessages();
    expect(sent.some((m) => m.includes('Consent is required'))).toBe(true);
  });

  it('handles flow fetch failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    const mockIO = createMockMessageIO([]);

    const result = await runProtocolOnboarding({
      llmClient: { async chat() { throw new Error('should not reach LLM'); } },
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to fetch onboarding flow');
  });

  it('handles questionnaire fetch failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/onboarding/flow/')) {
        return { ok: true, json: async () => MOCK_FLOW };
      }
      // All questionnaire fetches fail
      return { ok: false, status: 500 };
    }));

    const mockIO = createMockMessageIO([]);

    const result = await runProtocolOnboarding({
      llmClient: { async chat() { throw new Error('should not reach LLM'); } },
      messageIO: mockIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to fetch questionnaire');
  });

  it('handles LLM failure gracefully', async () => {
    mockFetchForFlow();

    const failingLLM: LLMClient = {
      async chat() { throw new Error('LLM connection refused'); },
    };

    const mockIO = createMockMessageIO(['anything']);

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
});
