/**
 * CareAgent activate command — clinical activation logic.
 *
 * The onboarding path (no CANS.md) is now handled entirely by the
 * slash command handler in `src/entry/openclaw.ts`. This module only
 * provides the clinical activation path and the CLI entry point that
 * routes between the two.
 *
 * Binding management uses direct filesystem writes via config-manager
 * instead of `openclaw agents add/bind/unbind` CLI calls, which are
 * unreliable when run from inside the running gateway process.
 *
 * Exposed as:
 * - `/careagent_on` slash command (calls `runClinicalActivation`)
 * - `openclaw careagent activate` CLI command (calls `runActivateCommand`)
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ActivationGate } from '../activation/gate.js';
import { supplementWorkspaceFiles } from '../onboarding/workspace-writer.js';
import { openclawProfile } from '../onboarding/workspace-profiles.js';
import { loadProviderProfile } from '../credentials/profile.js';
import { createNeuronClient } from '../neuron/client.js';
import { registerProvider } from '../registration/registration.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import type { WorkspaceProfile } from '../onboarding/workspace-profiles.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAREAGENT_ID = 'careagent-provider';
const CLINICAL_WORKSPACE_DIR = 'workspace-clinical';

// ---------------------------------------------------------------------------
// Activation result
// ---------------------------------------------------------------------------

export interface ActivateResult {
  success: boolean;
  clinicalWorkspacePath?: string;
  registered?: boolean;
  error?: string;
  onboarding?: boolean;
  /** User-facing messages (displayed on Telegram via slash command reply). */
  messages: string[];
}

// ---------------------------------------------------------------------------
// Clinical activation — CANS.md exists, full activation
// ---------------------------------------------------------------------------

export async function runClinicalActivation(
  _workspacePath: string,
  clinicalWorkspacePath: string,
  audit: AuditPipeline,
  traceId: string,
  profile?: WorkspaceProfile,
): Promise<ActivateResult> {
  const log = (msg: string) => console.log(msg);

  // Validate CANS.md in the clinical workspace
  const gate = new ActivationGate(clinicalWorkspacePath, (entry) =>
    audit.log({
      action: entry.action as string,
      actor: 'system',
      outcome: (entry.outcome as 'error') || 'error',
      details: entry.details as Record<string, unknown> | undefined,
      trace_id: traceId,
    }),
  );

  const activation = gate.check();
  if (!activation.active || !activation.document) {
    const reason = activation.reason || 'CANS.md validation failed';
    audit.log({
      action: 'careagent_activate',
      actor: 'provider',
      outcome: 'denied',
      details: { step: 'gate_check', reason, errors: activation.errors },
      trace_id: traceId,
    });
    return { success: false, error: `Cannot activate: ${reason}`, messages: [] };
  }

  const cans = activation.document;

  // Extract philosophy from CANS.md markdown body
  const cansPath = join(clinicalWorkspacePath, 'CANS.md');
  const cansRaw = readFileSync(cansPath, 'utf-8');
  const philosophyMatch = cansRaw.match(/## Clinical Philosophy\n\n([\s\S]*?)(?:\n\n##|\n*$)/);
  const philosophy = philosophyMatch?.[1]?.trim()
    || (cans.provider.specialty
      ? `Clinical agent for ${cans.provider.name}, specializing in ${cans.provider.specialty}`
      : `Clinical agent for ${cans.provider.name}`);

  // Supplement workspace files
  const resolvedProfile = profile ?? openclawProfile;
  supplementWorkspaceFiles(clinicalWorkspacePath, cans, philosophy, resolvedProfile);

  // Clean up onboarding files
  const bootstrapPath = join(clinicalWorkspacePath, 'BOOTSTRAP.md');
  const schemaPath = join(clinicalWorkspacePath, 'CANS-SCHEMA.md');
  if (existsSync(bootstrapPath)) {
    unlinkSync(bootstrapPath);
  }
  if (existsSync(schemaPath)) {
    unlinkSync(schemaPath);
  }

  // Register with neuron (first activation only)
  let registered = false;
  const existingProfile = loadProviderProfile(clinicalWorkspacePath);

  if (existingProfile && existingProfile.activation_status === 'active') {
    log('[CareAgent] Provider already registered — skipping registration');
    registered = true;
  } else {
    const neuronEndpoint = process.env['NEURON_ENDPOINT'] || process.env['NEURON_URL'];

    if (neuronEndpoint && cans.provider.npi) {
      try {
        const neuronClient = createNeuronClient();
        const { fileURLToPath } = await import('node:url');
        const { dirname } = await import('node:path');
        const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
        const skillsDir = join(pluginRoot, 'skills');

        const regResult = await registerProvider({
          workspacePath: clinicalWorkspacePath,
          skillsDir,
          audit,
          neuronClient,
          neuronEndpoint,
          npi: cans.provider.npi,
          providerName: cans.provider.name,
          providerTypes: cans.provider.types,
          specialty: cans.provider.specialty,
          credentials: cans.provider.licenses.map((lic) => ({
            type: 'license' as const,
            issuer: 'state',
            identifier: lic,
            status: 'active' as const,
          })),
        });

        registered = regResult.success;
        if (!regResult.success) {
          log(`[CareAgent] Registration warning: ${regResult.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[CareAgent] Registration warning: ${msg}`);
      }
    } else {
      log('[CareAgent] Neuron endpoint or NPI not configured — skipping registration');
    }
  }

  // Confirm activation
  audit.log({
    action: 'careagent_activate',
    actor: 'provider',
    outcome: 'active',
    details: {
      step: 'complete',
      agent_id: CAREAGENT_ID,
      clinical_workspace: clinicalWorkspacePath,
      registered,
      provider: cans.provider.name,
    },
    trace_id: traceId,
  });

  const messages = [
    `Clinical mode ACTIVATED for ${cans.provider.name}.`,
    'Telegram is now routed to the CareAgent.',
    'Use /careagent_off to return to your personal agent.',
  ];
  messages.forEach((m) => log(`[CareAgent] ${m}`));

  return { success: true, clinicalWorkspacePath, registered, messages };
}

// ---------------------------------------------------------------------------
// Main entry point — routes to onboarding or clinical activation
// ---------------------------------------------------------------------------

/**
 * CLI entry point for `openclaw careagent activate`.
 *
 * Handles routing between clinical activation (CANS.md exists) and
 * onboarding detection (BOOTSTRAP.md exists, or nothing exists yet).
 * The actual onboarding path is now handled by the slash command handler
 * in openclaw.ts for proper peer-level binding support.
 */
export async function runActivateCommand(
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,
): Promise<ActivateResult> {
  const traceId = audit.createTraceId();
  const log = (msg: string) => console.log(msg);

  const clinicalWorkspacePath = resolve(workspacePath, '..', CLINICAL_WORKSPACE_DIR);
  const clinicalCansPath = join(clinicalWorkspacePath, 'CANS.md');
  const onboardingCansPath = join(workspacePath, 'CANS.md');
  const bootstrapPath = join(clinicalWorkspacePath, 'BOOTSTRAP.md');

  // Path 1: CANS.md exists in clinical workspace → clinical activation
  if (existsSync(clinicalCansPath)) {
    return runClinicalActivation(workspacePath, clinicalWorkspacePath, audit, traceId, profile);
  }

  // Path 2: CANS.md exists in onboarding workspace → copy to clinical, then activate
  if (existsSync(onboardingCansPath)) {
    mkdirSync(clinicalWorkspacePath, { recursive: true });
    copyFileSync(onboardingCansPath, clinicalCansPath);

    // Copy integrity hash if it exists
    const integrityDir = join(clinicalWorkspacePath, '.careagent');
    mkdirSync(integrityDir, { recursive: true });
    const integritySource = join(workspacePath, '.careagent', 'cans-integrity.json');
    if (existsSync(integritySource)) {
      copyFileSync(integritySource, join(integrityDir, 'cans-integrity.json'));
    }

    return runClinicalActivation(workspacePath, clinicalWorkspacePath, audit, traceId, profile);
  }

  // Path 3: BOOTSTRAP.md exists but no CANS.md → onboarding already in progress
  if (existsSync(bootstrapPath)) {
    const messages = [
      'Onboarding is already in progress.',
      'Complete the interview with the CareAgent, then send /careagent_on again.',
    ];
    messages.forEach((m) => log(`[CareAgent] ${m}`));
    return { success: true, clinicalWorkspacePath, registered: false, onboarding: true, messages };
  }

  // Path 4: No CANS.md, no BOOTSTRAP.md → use /careagent_on slash command
  const messages = [
    'No CANS.md found. Use /careagent_on in Telegram to start onboarding.',
  ];
  messages.forEach((m) => log(`[CareAgent] ${m}`));
  return { success: false, error: 'No CANS.md found. Use /careagent_on to start onboarding.', messages };
}
