/**
 * Integration test for protocol-based onboarding (Interaction Protocol Engine).
 *
 * Proves the end-to-end flow:
 *   Axon questionnaire → Protocol Engine → Telegram (mock) → CANS.md
 *
 * Uses a mock LLM client that extracts question IDs from the system prompt
 * and returns pre-scripted submit_answer tool-use responses. Uses the real
 * physician.json and provider-config.json questionnaires.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

// ---------------------------------------------------------------------------
// Load real questionnaires
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadQuestionnaire(path: string): Questionnaire {
  return JSON.parse(readFileSync(path, 'utf-8')) as Questionnaire;
}

const axonRoot = resolve(__dirname, '..', '..', '..', 'axon');
const providerCoreRoot = resolve(__dirname, '..', '..');

const physicianQuestionnaire = loadQuestionnaire(
  join(axonRoot, 'data', 'questionnaires', 'physician.json'),
);
const providerConfigQuestionnaire = loadQuestionnaire(
  join(providerCoreRoot, 'data', 'questionnaires', 'provider-config.json'),
);

// ---------------------------------------------------------------------------
// Pre-scripted answers (question_id → value the mock LLM will submit)
// ---------------------------------------------------------------------------

const SCRIPTED_ANSWERS: Record<string, unknown> = {
  // Physician credentialing questionnaire
  provider_name: 'Dr. Jane Smith',
  has_degrees: true,
  degrees_list: 'MD',
  has_licenses: true,
  licenses_list: 'SC-25231',
  has_certifications: true,
  certifications_list: 'ABNS Board Certified',
  has_specialty: true,
  specialty_list: 'Neurosurgery',
  has_subspecialty: false,
  // subspecialty_list — skipped (has_subspecialty=false)
  practice_setting: 'private',
  // supervision_role — skipped (practice_setting != "academic")
  practice_npi: '1234567890',
  practice_name: 'Springfield Medical Group',
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

  // Provider-core configuration questionnaire
  clinical_philosophy: 'Evidence-based conservative medicine with patient-centered approach',
  voice_chart: 'Use structured SOAP format for all documentation',
  voice_educate: 'Write at accessible reading level with visual aids',
  voice_interpret: 'Always compare to previous results and flag critical values',
  autonomy_chart: 'autonomous',
  autonomy_order: 'supervised',
  autonomy_charge: 'supervised',
  autonomy_perform: 'manual',
  autonomy_interpret: 'supervised',
  autonomy_educate: 'autonomous',
  autonomy_coordinate: 'supervised',
  consent_confirm: true,
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
// Count applicable questions (for mock MessageIO response count)
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
    }
    seen.set(q.id, answers[q.id]);
    count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Protocol Onboarding E2E', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-protocol-e2e-'));
    toolUseCounter = 0;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces a valid CANS.md from physician onboarding', async () => {
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);

    // Mock MessageIO needs enough responses for all handleMessage calls
    // (each questionnaire needs N-1 responses for N questions, since start() handles Q1)
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();
    const auditEvents: Array<Record<string, unknown>> = [];

    const result = await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
      workspacePath: tmpDir,
      respondent: 'test-user-123',
      audit: (event) => auditEvents.push(event),
    });

    // Onboarding should succeed
    expect(result.success).toBe(true);
    expect(result.cansPath).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('CANS.md file exists and has SHA-256 sidecar', async () => {
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();

    const result = await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const cansPath = join(tmpDir, 'CANS.md');
    expect(existsSync(cansPath)).toBe(true);
    expect(existsSync(`${cansPath}.sha256`)).toBe(true);

    // SHA-256 sidecar matches file content
    const content = readFileSync(cansPath, 'utf-8');
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update(content).digest('hex');
    const actualHash = readFileSync(`${cansPath}.sha256`, 'utf-8');
    expect(actualHash).toBe(expectedHash);
  });

  it('CANS.md passes CANSSchema validation', async () => {
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
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
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    // Provider identity
    expect(frontmatter.provider.name).toBe('Dr. Jane Smith');
    expect(frontmatter.provider.types).toContain('physician');
    expect(frontmatter.provider.degrees).toContain('MD');
    expect(frontmatter.provider.licenses).toContain('SC-25231');
    expect(frontmatter.provider.certifications).toContain('ABNS Board Certified');
    expect(frontmatter.provider.organizations[0].name).toBe('Springfield Medical Group');
  });

  it('CANS.md contains correct autonomy tiers', async () => {
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
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
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    const actions = frontmatter.scope.permitted_actions;

    // From clinical_charting=true
    expect(actions).toContain('chart.progress_note');
    expect(actions).toContain('chart.history_and_physical');

    // From prescribing=true
    expect(actions).toContain('order.medication');

    // From controlled_substances=true
    expect(actions).toContain('order.controlled_substance');

    // From diagnostic_ordering=true
    expect(actions).toContain('order.laboratory');
    expect(actions).toContain('order.imaging');

    // From results_interpretation=true
    expect(actions).toContain('interpret.laboratory_result');

    // From clinical_procedures=true
    expect(actions).toContain('perform.physical_exam');

    // From patient_education=true
    expect(actions).toContain('educate.patient_education');

    // From care_coordination=true
    expect(actions).toContain('coordinate.referral');

    // From billing=true
    expect(actions).toContain('charge.evaluation_management');
  });

  it('CANS.md contains consent and philosophy', async () => {
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const content = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    // Consent
    expect(frontmatter.consent.hipaa_warning_acknowledged).toBe(true);
    expect(frontmatter.consent.synthetic_data_only).toBe(true);
    expect(frontmatter.consent.audit_consent).toBe(true);

    // Philosophy in markdown body
    expect(content).toContain('Evidence-based conservative medicine');
  });

  it('audit events are emitted during onboarding', async () => {
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();
    const auditEvents: Array<Record<string, unknown>> = [];

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
      workspacePath: tmpDir,
      respondent: 'test-user-123',
      audit: (event) => auditEvents.push(event),
    });

    // Should have session_started, answer_accepted (many), session_completed events
    const sessionStarted = auditEvents.filter((e) => e.event === 'session_started');
    const answersAccepted = auditEvents.filter((e) => e.event === 'answer_accepted');
    const sessionCompleted = auditEvents.filter((e) => e.event === 'session_completed');
    const onboardingCompleted = auditEvents.filter((e) => e.event === 'protocol_onboarding_completed');

    expect(sessionStarted.length).toBe(2); // one per questionnaire
    expect(answersAccepted.length).toBeGreaterThan(0);
    expect(sessionCompleted.length).toBe(2); // one per questionnaire
    expect(onboardingCompleted.length).toBe(1);
  });

  it('MessageIO receives completion message', async () => {
    const physicianCount = countApplicableQuestions(physicianQuestionnaire, SCRIPTED_ANSWERS);
    const configCount = countApplicableQuestions(providerConfigQuestionnaire, SCRIPTED_ANSWERS);
    const totalResponses = (physicianCount - 1) + (configCount - 1);
    const mockResponses = Array.from({ length: totalResponses }, () => 'yes');

    const messageIO = createMockMessageIO(mockResponses);
    const llmClient = createMockLLMClient();

    await runProtocolOnboarding({
      llmClient,
      messageIO,
      credentialingQuestionnaire: physicianQuestionnaire,
      workspacePath: tmpDir,
      respondent: 'test-user-123',
    });

    const sent = messageIO.getSentMessages();
    const lastMessage = sent[sent.length - 1];
    expect(lastMessage).toContain('configuration has been saved');
  });
});
