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

/** Universal consent questionnaire (3 boolean questions, structured mode). */
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
      { id: 'consent_hipaa', text: 'HIPAA acknowledged?', answer_type: 'boolean', required: true, cans_field: 'consent.hipaa_warning_acknowledged', mode: 'structured' },
      { id: 'consent_synthetic', text: 'Synthetic data confirmed?', answer_type: 'boolean', required: true, cans_field: 'consent.synthetic_data_only', mode: 'structured' },
      { id: 'consent_audit', text: 'Audit consent?', answer_type: 'boolean', required: true, cans_field: 'consent.audit_consent', mode: 'structured' },
    ],
  } as Questionnaire;
}

/** Provider type selection questionnaire (1 single_select question, structured mode). */
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
        mode: 'structured',
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

    // Consent (structured) + type selection (structured) = 0 LLM calls
    // Physician (guided) = 10 LLM responses
    const llmResponses: LLMResponse[] = [
      // Physician questionnaire only (consent + type selection are structured mode)
      makeToolUseResponse('Dr. Test', 'Name recorded', 'tu_1'),
      makeToolUseResponse('Test Clinic', 'Org recorded', 'tu_2'),
      makeToolUseResponse(true, 'Charting: yes', 'tu_3'),
      makeToolUseResponse('autonomous', 'Chart: autonomous', 'tu_4'),
      makeToolUseResponse('supervised', 'Order: supervised', 'tu_5'),
      makeToolUseResponse('supervised', 'Charge: supervised', 'tu_6'),
      makeToolUseResponse('manual', 'Perform: manual', 'tu_7'),
      makeToolUseResponse('supervised', 'Interpret: supervised', 'tu_8'),
      makeToolUseResponse('autonomous', 'Educate: autonomous', 'tu_9'),
      makeToolUseResponse('supervised', 'Coordinate: supervised', 'tu_10'),
    ];

    // User responses for handleMessage calls:
    // Consent (structured): 3 questions → start() presents Q1, 3 user answers needed
    // Type selection (structured): 1 question → start() presents Q1, 1 user answer needed
    // Physician (guided): 10 questions → start() + LLM handles Q1, 9 user messages needed
    // Total user messages: 3 + 1 + 9 = 13
    const userResponses = [
      'yes', 'yes', 'yes',  // consent
      'physician',           // type selection
      ...Array.from({ length: 9 }, () => 'yes'),  // physician
    ];

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

    // Only physician questions use LLM (consent + type selection are structured)
    const llmResponses: LLMResponse[] = [
      makeToolUseResponse('Dr. Audit', 'Name', 'tu_1'),
      makeToolUseResponse('Clinic', 'Org', 'tu_2'),
      makeToolUseResponse(true, 'Chart', 'tu_3'),
      makeToolUseResponse('supervised', 'A1', 'tu_4'),
      makeToolUseResponse('supervised', 'A2', 'tu_5'),
      makeToolUseResponse('supervised', 'A3', 'tu_6'),
      makeToolUseResponse('manual', 'A4', 'tu_7'),
      makeToolUseResponse('supervised', 'A5', 'tu_8'),
      makeToolUseResponse('supervised', 'A6', 'tu_9'),
      makeToolUseResponse('supervised', 'A7', 'tu_10'),
    ];

    const auditFn = vi.fn();
    const userResponses = [
      'yes', 'yes', 'yes',  // consent (structured)
      'physician',           // type selection (structured)
      ...Array.from({ length: 9 }, () => 'yes'),  // physician (guided)
    ];
    const mockIO = createMockMessageIO(userResponses);

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

    // No LLM needed — consent is structured mode
    const mockIO = createMockMessageIO(['no', 'yes', 'yes']);

    const result = await runProtocolOnboarding({
      llmClient: { async chat() { throw new Error('LLM should not be called for consent'); } },
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

    // Consent (3 structured) + type selection (1 structured) pass without LLM
    // LLM failure triggers when physician questionnaire starts
    const mockIO = createMockMessageIO([
      'yes', 'yes', 'yes',  // consent (structured, no LLM)
      'physician',           // type selection (structured, no LLM)
    ]);

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
