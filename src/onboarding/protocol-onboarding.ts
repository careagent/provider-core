/**
 * Protocol-based onboarding — replaces BOOTSTRAP.md approach.
 * Runs two questionnaires in sequence via the protocol engine,
 * then merges answers into a CANS.md artifact.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  credentialingQuestionnaire: Questionnaire;
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
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// loadProviderConfigQuestionnaire
// ---------------------------------------------------------------------------

function loadProviderConfigQuestionnaire(): Questionnaire {
  // Walk up from src/onboarding/ to find data/questionnaires/
  let current = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(current, 'data', 'questionnaires', 'provider-config.json');
    try {
      const content = readFileSync(candidate, 'utf-8');
      return JSON.parse(content) as Questionnaire;
    } catch {
      current = dirname(current);
    }
  }
  throw new Error('Could not locate provider-config.json questionnaire');
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
    credentialingQuestionnaire,
    workspacePath,
    respondent,
    audit,
  } = config;

  try {
    // Phase 1: Run Axon credentialing questionnaire
    const credentialEngine = createProtocolEngine({
      llmClient,
      questionnaire: credentialingQuestionnaire,
      authority: 'axon',
      respondent,
      audit,
    });

    const credentialAnswers = await runQuestionnaire(credentialEngine, messageIO);

    // Phase 2: Run provider-core configuration questionnaire
    const configQuestionnaire = loadProviderConfigQuestionnaire();
    const configEngine = createProtocolEngine({
      llmClient,
      questionnaire: configQuestionnaire,
      authority: 'provider-core',
      respondent,
      audit,
    });

    const configAnswers = await runQuestionnaire(configEngine, messageIO);

    // Phase 3: Merge answers into CANS.md
    const cansResult = buildCANSDocument(
      credentialAnswers,
      configAnswers,
      credentialingQuestionnaire,
      configQuestionnaire,
    );

    if (!cansResult.success || !cansResult.content) {
      return {
        success: false,
        error: `CANS generation failed: ${cansResult.errors?.map((e) => e.message).join(', ')}`,
      };
    }

    // Phase 4: Write CANS.md + integrity sidecar
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
// buildCANSDocument — merge credential + config answers into CANS
// ---------------------------------------------------------------------------

function buildCANSDocument(
  credentialAnswers: Record<string, unknown>,
  configAnswers: Record<string, unknown>,
  credentialQuestionnaire: Questionnaire,
  _configQuestionnaire: Questionnaire,
): { success: boolean; content?: string; errors?: Array<{ path: string; message: string }> } {
  // Extract philosophy
  const philosophy = (configAnswers['clinical_philosophy'] as string) ?? '';

  // Build autonomy from config answers
  const autonomy = {
    chart: (configAnswers['autonomy_chart'] as string) ?? 'supervised',
    order: (configAnswers['autonomy_order'] as string) ?? 'supervised',
    charge: (configAnswers['autonomy_charge'] as string) ?? 'supervised',
    perform: (configAnswers['autonomy_perform'] as string) ?? 'manual',
    interpret: (configAnswers['autonomy_interpret'] as string) ?? 'supervised',
    educate: (configAnswers['autonomy_educate'] as string) ?? 'supervised',
    coordinate: (configAnswers['autonomy_coordinate'] as string) ?? 'supervised',
  };

  // Build voice from config answers (optional fields)
  const voice: Record<string, string> = {};
  if (configAnswers['voice_chart']) voice.chart = configAnswers['voice_chart'] as string;
  if (configAnswers['voice_educate']) voice.educate = configAnswers['voice_educate'] as string;
  if (configAnswers['voice_interpret']) voice.interpret = configAnswers['voice_interpret'] as string;

  // Build consent
  const consent = {
    hipaa_warning_acknowledged: configAnswers['consent_confirm'] === true,
    synthetic_data_only: configAnswers['consent_confirm'] === true,
    audit_consent: configAnswers['consent_confirm'] === true,
    acknowledged_at: new Date().toISOString(),
  };

  // Build provider identity from credential answers
  const providerName = (credentialAnswers['provider_name'] as string) ?? '';
  const practiceName = (credentialAnswers['practice_name'] as string) ?? 'Unknown';
  const practiceNpi = credentialAnswers['practice_npi'] as string | undefined;

  const organizations: CANSDocument['provider']['organizations'] = [{
    name: practiceName,
    primary: true,
  }];

  // Build base document from credential answers using artifact generator
  const generator = createCANSArtifactGenerator();
  const baseDoc: Partial<CANSDocument> = {
    version: '2.0',
    provider: {
      name: providerName,
      types: [credentialQuestionnaire.provider_type],
      degrees: [],
      licenses: [],
      certifications: [],
      organizations,
      ...(practiceNpi ? { npi: practiceNpi } : {}),
    },
    scope: { permitted_actions: [] },
    autonomy: autonomy as CANSDocument['autonomy'],
    consent,
    skills: { authorized: [] },
  };

  if (Object.keys(voice).length > 0) {
    (baseDoc as Record<string, unknown>).voice = voice;
  }

  return generator.generate(
    credentialAnswers,
    credentialQuestionnaire,
    baseDoc,
    philosophy,
  );
}
