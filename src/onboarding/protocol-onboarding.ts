/**
 * Protocol-based onboarding — flow-driven approach.
 *
 * Fetches the onboarding flow from Axon, executes each step's questionnaire
 * via the protocol engine, accumulates answers, then generates CANS.md.
 *
 * The flow has 3 steps:
 * 1. Universal consent (HIPAA, synthetic data, audit)
 * 2. Provider type selection (routes to next step)
 * 3. Type-specific questionnaire (resolved via {{provider_type}} placeholder)
 */

import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createProtocolEngine, type ProtocolEngine } from '../protocol/engine.js';
import { createCANSArtifactGenerator } from '../protocol/artifact-generator.js';
import type { LLMClient } from '../protocol/llm-client.js';
import type { MessageIO } from '../protocol/message-io.js';
import type { Questionnaire, Question } from '@careagent/axon/types';
import type { CANSDocument } from '../activation/cans-schema.js';
import type { AxonOnboardingFlow } from '../axon/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtocolOnboardingConfig {
  llmClient: LLMClient;
  messageIO: MessageIO;
  axonUrl: string;
  workspacePath: string;
  respondent?: string;
  audit?: (event: Record<string, unknown>) => void;
}

export interface ProtocolOnboardingResult {
  success: boolean;
  cansPath?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// runProtocolOnboarding — flow-driven
// ---------------------------------------------------------------------------

export async function runProtocolOnboarding(
  config: ProtocolOnboardingConfig,
): Promise<ProtocolOnboardingResult> {
  const {
    llmClient,
    messageIO,
    axonUrl,
    workspacePath,
    respondent,
    audit,
  } = config;

  try {
    // Step 1: Fetch onboarding flow from Axon
    const flowRes = await fetch(`${axonUrl}/v1/onboarding/flow/provider`);
    if (!flowRes.ok) {
      throw new Error(`Failed to fetch onboarding flow from Axon: ${flowRes.status}`);
    }
    const flow = await flowRes.json() as AxonOnboardingFlow;

    // Accumulate answers across all steps
    const allAnswers: Record<string, unknown> = {};
    const allQuestions: Question[] = [];
    let routingValue: string | undefined;
    let providerType: string | undefined;

    // Step 2: Execute each step in the flow
    for (const step of flow.steps) {
      // Resolve questionnaire ID (substitute {{provider_type}} placeholder)
      const questionnaireId = resolveQuestionnaireId(step.questionnaire_id, routingValue);

      // Fetch questionnaire from Axon
      const questionnaireRes = await fetch(`${axonUrl}/v1/questionnaires/${encodeURIComponent(questionnaireId)}`);
      if (!questionnaireRes.ok) {
        throw new Error(`Failed to fetch questionnaire '${questionnaireId}' from Axon: ${questionnaireRes.status}`);
      }
      const questionnaire = await questionnaireRes.json() as Questionnaire;

      // Run questionnaire via protocol engine
      const engine = createProtocolEngine({
        llmClient,
        questionnaire,
        authority: questionnaire.authority ?? 'axon',
        respondent,
        audit,
      });

      const stepAnswers = await runQuestionnaire(engine, messageIO);

      // Accumulate answers and questions
      Object.assign(allAnswers, stepAnswers);
      allQuestions.push(...questionnaire.questions);

      // Extract routing value if this step routes to next
      if (step.routes_to_next && step.routing_question_id) {
        routingValue = String(stepAnswers[step.routing_question_id] ?? '');
        providerType = routingValue;

        if (audit) {
          audit({ event: 'provider_type_selected', provider_type: providerType, respondent });
        }
      }

      // After consent step: hard-stop if any consent is false
      if (questionnaire.output_artifact === 'consent') {
        const consentDenied = questionnaire.questions.some(
          (q) => q.required && q.answer_type === 'boolean' && stepAnswers[q.id] === false,
        );
        if (consentDenied) {
          await messageIO.send('Consent is required to proceed with onboarding. Please try again with /careagent_on.');
          return { success: false, error: 'Required consent not granted.' };
        }
      }
    }

    // Step 3: Build merged questionnaire for CANS generation
    const mergedQuestionnaire: Questionnaire = {
      provider_type: providerType ?? 'unknown',
      version: '1.0.0',
      taxonomy_version: '1.0.0',
      display_name: 'Merged Onboarding',
      description: 'Merged questionnaire from onboarding flow steps.',
      questions: allQuestions,
    };

    // Step 4: Build CANS.md from accumulated answers
    const cansResult = buildCANSDocument(allAnswers, mergedQuestionnaire, providerType);

    if (!cansResult.success || !cansResult.content) {
      return {
        success: false,
        error: `CANS generation failed: ${cansResult.errors?.map((e) => e.message).join(', ')}`,
      };
    }

    // Step 5: Write CANS.md + integrity sidecar
    const cansPath = join(workspacePath, 'CANS.md');
    writeFileSync(cansPath, cansResult.content, 'utf-8');

    const hash = createHash('sha256').update(cansResult.content).digest('hex');
    writeFileSync(`${cansPath}.sha256`, hash, 'utf-8');

    await messageIO.send(
      'Your CareAgent configuration has been saved. To activate clinical mode, send /careagent_on.',
    );

    if (audit) {
      audit({
        event: 'protocol_onboarding_completed',
        cans_path: cansPath,
        respondent,
      });
    }

    return { success: true, cansPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (audit) {
      audit({
        event: 'protocol_onboarding_failed',
        error: msg,
        respondent,
      });
    }

    await messageIO.send(`Onboarding failed: ${msg}\n\nPlease try again with /careagent_on.`).catch(() => {});
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// resolveQuestionnaireId — substitute {{placeholder}} with routing value
// ---------------------------------------------------------------------------

function resolveQuestionnaireId(templateId: string, routingValue: string | undefined): string {
  if (!templateId.includes('{{')) return templateId;
  if (routingValue === undefined) {
    throw new Error(`Questionnaire ID '${templateId}' contains a placeholder but no routing value is available.`);
  }
  return templateId.replace(/\{\{(\w+)\}\}/g, () => routingValue);
}

// ---------------------------------------------------------------------------
// runQuestionnaire — drives a single protocol engine to completion
// ---------------------------------------------------------------------------

async function runQuestionnaire(
  engine: ProtocolEngine,
  io: MessageIO,
): Promise<Record<string, unknown>> {
  // Start the engine — get first message
  const firstMessage = await engine.start();
  await io.send(firstMessage);

  // Message loop until complete
  while (!engine.isComplete()) {
    const userMessage = await io.receive();
    const response = await engine.handleMessage(userMessage);
    if (response) {
      await io.send(response);
    }
  }

  return engine.getAnswers();
}

// ---------------------------------------------------------------------------
// buildCANSDocument — build CANS from merged answers + merged questionnaire
// ---------------------------------------------------------------------------

function buildCANSDocument(
  answers: Record<string, unknown>,
  questionnaire: Questionnaire,
  providerType: string | undefined,
): { success: boolean; content?: string; errors?: Array<{ path: string; message: string }> } {
  // Extract philosophy (no cans_field — goes in markdown body)
  const philosophy = (answers['clinical_philosophy'] as string) ?? '';

  // Build organizations from answers
  const orgName = (answers['organization_name'] as string) ?? 'Unknown';
  const organizations: CANSDocument['provider']['organizations'] = [{
    name: orgName,
    primary: true,
  }];

  // Build base document — all field values come from questionnaire answers via cans_field.
  // No hardcoded autonomy defaults or consent defaults — those are provided by
  // the universal consent and type-specific questionnaires.
  const baseDoc: Partial<CANSDocument> = {
    version: '2.0',
    provider: {
      name: (answers['provider_name'] as string) ?? '',
      types: [providerType ?? questionnaire.provider_type],
      degrees: [],
      licenses: [],
      certifications: [],
      organizations,
      ...((answers['individual_npi'] as string) ? { npi: answers['individual_npi'] as string } : {}),
    },
    scope: { permitted_actions: [] },
    autonomy: {} as CANSDocument['autonomy'],
    consent: {
      hipaa_warning_acknowledged: false,
      synthetic_data_only: false,
      audit_consent: false,
      acknowledged_at: new Date().toISOString(),
    },
    skills: { authorized: [] },
  };

  const generator = createCANSArtifactGenerator();
  return generator.generate(answers, questionnaire, baseDoc, philosophy);
}
