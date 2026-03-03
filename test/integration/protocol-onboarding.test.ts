/**
 * Integration test for protocol-based onboarding (flow-driven).
 *
 * Proves the end-to-end flow:
 *   Onboarding flow fetch → Consent → Provider type selection → Type-specific questionnaire → CANS.md
 *
 * Uses a mock LLM client that extracts question IDs from the system prompt
 * and returns pre-scripted submit_answer tool-use responses. Uses the real
 * physician.json questionnaire from axon plus the new meta-questionnaires.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Value } from '@sinclair/typebox/value';

import { runProtocolOnboarding } from '../../src/onboarding/protocol-onboarding.js';
import { createMockMessageIO } from '../../src/protocol/message-io.js';
import { CANSSchema } from '../../src/activation/cans-schema.js';
import { parseFrontmatter } from '../../src/activation/cans-parser.js';
import type { LLMClient, LLMChatParams, LLMResponse } from '../../src/protocol/llm-client.js';
import type { Questionnaire } from '@careagent/axon/types';
import type { AxonOnboardingFlow } from '../../src/axon/types.js';

// ---------------------------------------------------------------------------
// Load real questionnaires
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadQuestionnaireFile(path: string): Questionnaire {
  return JSON.parse(readFileSync(path, 'utf-8')) as Questionnaire;
}

const axonRoot = resolve(__dirname, '..', '..', '..', 'axon');

const consentQuestionnaire = loadQuestionnaireFile(
  join(axonRoot, 'data', 'questionnaires', '_universal_consent.json'),
);

const typeSelectionQuestionnaire = loadQuestionnaireFile(
  join(axonRoot, 'data', 'questionnaires', '_provider_type_selection.json'),
);

// Enrich type selection options (normally done by Axon loader)
const typeQuestion = typeSelectionQuestionnaire.questions.find((q) => q.id === 'provider_type');
if (typeQuestion) {
  typeQuestion.options = [
    { value: 'physician', label: 'Physician (MD, DO)' },
    { value: 'nursing', label: 'Nursing (RN, LPN)' },
  ];
}

const physicianQuestionnaire = loadQuestionnaireFile(
  join(axonRoot, 'data', 'questionnaires', 'physician.json'),
);

/** The 3-step onboarding flow. */
const MOCK_FLOW: AxonOnboardingFlow = {
  target_type: 'provider',
  steps: [
    { questionnaire_id: '_universal_consent', label: 'Consent' },
    { questionnaire_id: '_provider_type_selection', label: 'Provider Type', routes_to_next: true, routing_question_id: 'provider_type' },
    { questionnaire_id: '{{provider_type}}', label: 'Onboarding Questionnaire' },
  ],
};

// ---------------------------------------------------------------------------
// Pre-scripted answers (question_id → value the mock LLM will submit)
// ---------------------------------------------------------------------------

const SCRIPTED_ANSWERS: Record<string, unknown> = {
  // Consent (from _universal_consent)
  consent_hipaa: true,
  consent_synthetic: true,
  consent_audit: true,

  // Provider type selection (from _provider_type_selection)
  provider_type: 'physician',

  // Identity
  individual_npi: '1234567890',
  provider_name: 'Dr. Jane Smith',
  organization_npi: '9876543210',
  organization_name: 'Springfield Medical Group',

  // Credentials
  has_additional_types: false,
  has_degrees: true,
  degrees_list: 'MD',
  has_licenses: true,
  licenses_list: 'SC-25231',
  has_certifications: true,
  certifications_list: 'ABNS Board Certified',

  // Specialty
  has_specialty: true,
  specialty_list: 'Neurosurgery',
  has_subspecialty: false,

  // Scope
  practice_setting: 'private',
  clinical_charting: true,
  prescribing: true,
  dea_number: 'AB1234567',
  controlled_substances: true,
  diagnostic_ordering: true,
  results_interpretation: true,
  clinical_procedures: true,
  patient_education: true,
  care_coordination: true,
  billing: true,

  // Philosophy
  clinical_philosophy: 'Evidence-based conservative medicine with patient-centered approach',

  // Voice
  voice_chart: 'Use structured SOAP format for all documentation',
  voice_educate: 'Write at accessible reading level with visual aids',
  voice_interpret: 'Always compare to previous results and flag critical values',

  // Autonomy
  autonomy_chart: 'autonomous',
  autonomy_order: 'supervised',
  autonomy_charge: 'supervised',
  autonomy_perform: 'manual',
  autonomy_interpret: 'supervised',
  autonomy_educate: 'autonomous',
  autonomy_coordinate: 'supervised',
};

// ---------------------------------------------------------------------------
// Mock LLM Client
// ---------------------------------------------------------------------------

let toolUseCounter = 0;

function createMockLLMClient(): LLMClient {
  return {
    async chat(params: LLMChatParams): Promise<LLMResponse> {
      // Extract question ID from system prompt
      const match = params.system.match(/\*\*Question ID:\*\*\s+(\w+)/);
      if (!match) {
        throw new Error(`Mock LLM: could not extract question ID from system prompt`);
      }
      const questionId = match[1]!;
      const answer = SCRIPTED_ANSWERS[questionId];
      if (answer === undefined) {
        throw new Error(`Mock LLM: no scripted answer for question "${questionId}"`);
      }

      toolUseCounter++;
      const toolUseId = `toolu_mock_${toolUseCounter}`;

      return {
        id: `msg_mock_${toolUseCounter}`,
        content: [
          {
            type: 'tool_use',
            id: toolUseId,
            name: 'submit_answer',
            input: {
              value: answer,
              display_text: `Got it — recorded your answer for ${questionId}.`,
            },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Count applicable questions across all 3 questionnaires
// ---------------------------------------------------------------------------

function countApplicableQuestions(
  questionnaire: Questionnaire,
  answers: Record<string, unknown>,
): number {
  let count = 0;
  const seen = new Map<string, unknown>();

  for (const q of questionnaire.questions) {
    if (q.show_when) {
      const refAnswer = seen.get(q.show_when.question_id);
      if (refAnswer === undefined) continue;
      const refStr = String(refAnswer);
      if (q.show_when.equals !== undefined && refStr !== q.show_when.equals) continue;
      if (q.show_when.operator === 'equals' && q.show_when.value !== undefined && refStr !== q.show_when.value) continue;
    }
    seen.set(q.id, answers[q.id]);
    count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Mock fetch for Axon endpoints (routes by URL)
// ---------------------------------------------------------------------------

function mockAxonFetch(): void {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/v1/onboarding/flow/')) {
      return { ok: true, json: async () => MOCK_FLOW };
    }
    if (url.includes('/v1/questionnaires/_universal_consent')) {
      return { ok: true, json: async () => consentQuestionnaire };
    }
    if (url.includes('/v1/questionnaires/_provider_type_selection')) {
      return { ok: true, json: async () => typeSelectionQuestionnaire };
    }
    if (url.includes('/v1/questionnaires/physician')) {
      return { ok: true, json: async () => physicianQuestionnaire };
    }
    return { ok: false, status: 404 };
  }));
}

// ---------------------------------------------------------------------------
// Helper to run onboarding with standard setup
// ---------------------------------------------------------------------------

/**
 * Create a scripted mock IO that provides the correct answer for each question.
 *
 * For structured mode questions, the engine sends the exact question text in the
 * message. We match the question text against all known questions and return the
 * scripted answer value. For guided mode questions (where the LLM produces the
 * response), we fall back to "yes" as a generic user message that triggers the LLM.
 */
function createScriptedMockIO(
  answers: Record<string, unknown>,
  questionnaires: Questionnaire[],
): ReturnType<typeof createMockMessageIO> {
  const sent: string[] = [];
  const questionsByText = new Map<string, { id: string; answer_type: string }>();

  for (const q of questionnaires) {
    for (const question of q.questions) {
      questionsByText.set(question.text, { id: question.id, answer_type: question.answer_type });
    }
  }

  return {
    async send(text: string): Promise<void> {
      sent.push(text);
    },

    async receive(): Promise<string> {
      const lastSent = sent[sent.length - 1];
      if (!lastSent) return 'yes';

      // Match structured question text in the sent message
      for (const [text, { id }] of questionsByText) {
        if (lastSent.includes(text)) {
          const answer = answers[id];
          if (answer !== undefined) {
            return String(answer);
          }
        }
      }

      // Fallback for guided mode (LLM display_text doesn't contain question text)
      return 'yes';
    },

    getSentMessages(): string[] {
      return [...sent];
    },
  };
}

function createStandardOnboardingConfig(tmpDir: string) {
  const messageIO = createScriptedMockIO(
    SCRIPTED_ANSWERS,
    [consentQuestionnaire, typeSelectionQuestionnaire, physicianQuestionnaire],
  );
  const llmClient = createMockLLMClient();

  return { messageIO, llmClient };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Protocol Onboarding E2E (flow-driven)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-protocol-e2e-'));
    toolUseCounter = 0;
    mockAxonFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces a valid CANS.md from flow-driven physician onboarding', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);
    const auditEvents: Array<Record<string, unknown>> = [];

    const result = await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
      audit: (event) => auditEvents.push(event),
    });

    expect(result.success).toBe(true);
    expect(result.cansPath).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('CANS.md file exists and has SHA-256 sidecar', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const cansPath = join(tmpDir, 'CANS.md');
    expect(existsSync(cansPath)).toBe(true);
    expect(existsSync(`${cansPath}.sha256`)).toBe(true);

    const content = readFileSync(cansPath, 'utf-8');
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update(content).digest('hex');
    const actualHash = readFileSync(`${cansPath}.sha256`, 'utf-8');
    expect(actualHash).toBe(expectedHash);
  });

  it('CANS.md passes CANSSchema validation', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter, error } = parseFrontmatter(content);
    expect(error).toBeUndefined();
    expect(frontmatter).not.toBeNull();

    const valid = Value.Check(CANSSchema, frontmatter);
    if (!valid) {
      const errors = [...Value.Errors(CANSSchema, frontmatter)];
      throw new Error(
        `CANSSchema validation failed:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
      );
    }
    expect(valid).toBe(true);
  });

  it('CANS.md contains correct provider fields', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter.provider.name).toBe('Dr. Jane Smith');
    expect(frontmatter.provider.types).toContain('physician');
    expect(frontmatter.provider.degrees).toContain('MD');
    expect(frontmatter.provider.licenses).toContain('SC-25231');
    expect(frontmatter.provider.certifications).toContain('ABNS Board Certified');
    expect(frontmatter.provider.organizations[0].name).toBe('Springfield Medical Group');
  });

  it('CANS.md contains correct autonomy tiers', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter.autonomy.chart).toBe('autonomous');
    expect(frontmatter.autonomy.order).toBe('supervised');
    expect(frontmatter.autonomy.charge).toBe('supervised');
    expect(frontmatter.autonomy.perform).toBe('manual');
    expect(frontmatter.autonomy.interpret).toBe('supervised');
    expect(frontmatter.autonomy.educate).toBe('autonomous');
    expect(frontmatter.autonomy.coordinate).toBe('supervised');
  });

  it('CANS.md contains permitted actions from action_assignments', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    const actions = frontmatter.scope.permitted_actions;

    expect(actions).toContain('chart.progress_note');
    expect(actions).toContain('chart.history_and_physical');
    expect(actions).toContain('order.medication');
    expect(actions).toContain('order.controlled_substance');
    expect(actions).toContain('order.laboratory');
    expect(actions).toContain('order.imaging');
    expect(actions).toContain('interpret.laboratory_result');
    expect(actions).toContain('perform.physical_exam');
    expect(actions).toContain('educate.patient_education');
    expect(actions).toContain('coordinate.referral');
    expect(actions).toContain('charge.evaluation_management');
  });

  it('CANS.md contains consent from universal consent step and philosophy', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter.consent.hipaa_warning_acknowledged).toBe(true);
    expect(frontmatter.consent.synthetic_data_only).toBe(true);
    expect(frontmatter.consent.audit_consent).toBe(true);

    expect(content).toContain('Evidence-based conservative medicine');
  });

  it('CANS.md contains voice directives', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter.voice).toBeDefined();
    expect(frontmatter.voice.chart).toBe('Use structured SOAP format for all documentation');
    expect(frontmatter.voice.educate).toBe('Write at accessible reading level with visual aids');
    expect(frontmatter.voice.interpret).toBe('Always compare to previous results and flag critical values');
  });

  it('audit events are emitted during flow-driven onboarding', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);
    const auditEvents: Array<Record<string, unknown>> = [];

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
      audit: (event) => auditEvents.push(event),
    });

    const typeSelected = auditEvents.filter((e) => e.event === 'provider_type_selected');
    const sessionStarted = auditEvents.filter((e) => e.event === 'session_started');
    const answersAccepted = auditEvents.filter((e) => e.event === 'answer_accepted');
    const sessionCompleted = auditEvents.filter((e) => e.event === 'session_completed');
    const onboardingCompleted = auditEvents.filter((e) => e.event === 'protocol_onboarding_completed');

    expect(typeSelected.length).toBe(1);
    expect(sessionStarted.length).toBe(3); // 3 steps = 3 sessions
    expect(answersAccepted.length).toBeGreaterThan(0);
    expect(sessionCompleted.length).toBe(3);
    expect(onboardingCompleted.length).toBe(1);
  });

  it('MessageIO receives completion message', async () => {
    const { messageIO, llmClient } = createStandardOnboardingConfig(tmpDir);

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      axonUrl: 'http://axon.test',
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const sent = messageIO.getSentMessages();
    const lastMessage = sent[sent.length - 1];
    expect(lastMessage).toContain('configuration has been saved');
  });
});
