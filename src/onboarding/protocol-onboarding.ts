/**
 * Protocol-based onboarding — replaces BOOTSTRAP.md approach.
 * Asks provider type first, fetches the appropriate questionnaire from Axon,
 * runs a single unified questionnaire, then generates CANS.md.
 */

import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createProtocolEngine, type ProtocolEngine } from '../protocol/engine.js';
import { createCANSArtifactGenerator } from '../protocol/artifact-generator.js';
import type { LLMClient } from '../protocol/llm-client.js';
import type { MessageIO } from '../protocol/message-io.js';
import type { Questionnaire } from '@careagent/axon/types';
import type { CANSDocument } from '../activation/cans-schema.js';

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
// Provider type selection
// ---------------------------------------------------------------------------

const PROVIDER_TYPES = [
  { id: 'physician', label: 'Physician (MD, DO)' },
  { id: 'advanced_practice_provider', label: 'Advanced Practice Provider (NP, PA)' },
  { id: 'nursing', label: 'Nursing (RN, LPN)' },
  { id: 'pharmacy', label: 'Pharmacy (PharmD, RPh)' },
  { id: 'dental', label: 'Dental (DDS, DMD)' },
  { id: 'behavioral_mental_health', label: 'Behavioral/Mental Health (Psychologist, LCSW)' },
  { id: 'physical_rehabilitation', label: 'Physical Rehabilitation (PT, OT)' },
  { id: 'other', label: 'Other Healthcare Provider' },
] as const;

/** Exported for testing. */
export { PROVIDER_TYPES };

/**
 * Parse a provider type from user input (number, id, or label fragment).
 * Returns the provider type id or undefined if not matched.
 */
export function parseProviderType(input: string): string | undefined {
  const trimmed = input.trim().toLowerCase();

  // Try numeric selection (1-8)
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= PROVIDER_TYPES.length) {
    return PROVIDER_TYPES[num - 1]!.id;
  }

  // Try exact id match
  const byId = PROVIDER_TYPES.find((t) => t.id === trimmed);
  if (byId) return byId.id;

  // Try label substring match
  const byLabel = PROVIDER_TYPES.find((t) => t.label.toLowerCase().includes(trimmed));
  if (byLabel) return byLabel.id;

  return undefined;
}

// ---------------------------------------------------------------------------
// runProtocolOnboarding
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
    // Phase 1: Ask provider type
    const typeList = PROVIDER_TYPES.map((t, i) => `${i + 1}. ${t.label}`).join('\n');
    await messageIO.send(
      `Welcome to CareAgent onboarding.\n\nWhat is your provider type?\n\n${typeList}\n\nReply with the number or name.`,
    );

    let providerType: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await messageIO.receive();
      providerType = parseProviderType(response);
      if (providerType) break;
      await messageIO.send(
        'I didn\'t recognize that provider type. Please reply with a number (1-8) or type name.',
      );
    }

    if (!providerType) {
      return { success: false, error: 'Could not determine provider type after 3 attempts.' };
    }

    if (audit) {
      audit({ event: 'provider_type_selected', provider_type: providerType, respondent });
    }

    // Phase 2: Fetch questionnaire from Axon
    const questionnaireRes = await fetch(`${axonUrl}/v1/questionnaires/${providerType}`);
    if (!questionnaireRes.ok) {
      throw new Error(`Failed to fetch questionnaire from Axon: ${questionnaireRes.status}`);
    }
    const questionnaire = await questionnaireRes.json() as Questionnaire;

    // Phase 3: Run unified questionnaire via protocol engine
    const engine = createProtocolEngine({
      llmClient,
      questionnaire,
      authority: questionnaire.authority ?? 'axon',
      respondent,
      audit,
    });

    const answers = await runQuestionnaire(engine, messageIO);

    // Phase 4: Build CANS.md from answers
    const cansResult = buildCANSDocument(answers, questionnaire);

    if (!cansResult.success || !cansResult.content) {
      return {
        success: false,
        error: `CANS generation failed: ${cansResult.errors?.map((e) => e.message).join(', ')}`,
      };
    }

    // Phase 5: Write CANS.md + integrity sidecar
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
// buildCANSDocument — build CANS from unified questionnaire answers
// ---------------------------------------------------------------------------

function buildCANSDocument(
  answers: Record<string, unknown>,
  questionnaire: Questionnaire,
): { success: boolean; content?: string; errors?: Array<{ path: string; message: string }> } {
  // Extract philosophy (no cans_field — goes in markdown body)
  const philosophy = (answers['clinical_philosophy'] as string) ?? '';

  // Build organizations from answers
  const orgName = (answers['organization_name'] as string) ?? 'Unknown';
  const organizations: CANSDocument['provider']['organizations'] = [{
    name: orgName,
    primary: true,
  }];

  // Build base document — the artifact generator will overlay cans_field values
  const baseDoc: Partial<CANSDocument> = {
    version: '2.0',
    provider: {
      name: (answers['provider_name'] as string) ?? '',
      types: [questionnaire.provider_type],
      degrees: [],
      licenses: [],
      certifications: [],
      organizations,
      ...((answers['individual_npi'] as string) ? { npi: answers['individual_npi'] as string } : {}),
    },
    scope: { permitted_actions: [] },
    autonomy: {
      chart: 'supervised',
      order: 'supervised',
      charge: 'supervised',
      perform: 'manual',
      interpret: 'supervised',
      educate: 'supervised',
      coordinate: 'supervised',
    } as CANSDocument['autonomy'],
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
