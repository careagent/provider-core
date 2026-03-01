/**
 * CareAgent activate command — two-path activation:
 *
 * 1. **Onboarding path** (no CANS.md): Creates the CareAgent agent with
 *    BOOTSTRAP.md + CANS-SCHEMA.md so the LLM can conduct the onboarding
 *    interview conversationally and write CANS.md.
 *
 * 2. **Clinical path** (CANS.md exists): Validates, supplements workspace
 *    files, binds Telegram, cleans up bootstrap files, and registers with
 *    neuron.
 *
 * Exposed as:
 * - `/careagent_on` slash command (auto-reply, no LLM)
 * - `openclaw careagent activate` CLI command (deployment automation)
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ActivationGate } from '../activation/gate.js';
import { supplementWorkspaceFiles } from '../onboarding/workspace-writer.js';
import { openclawProfile } from '../onboarding/workspace-profiles.js';
import { generateOnboardingBootstrap, generateCansSchemaReference } from '../onboarding/onboarding-bootstrap.js';
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
}

// ---------------------------------------------------------------------------
// Shell exec helper
// ---------------------------------------------------------------------------

function execCli(command: string, log: (msg: string) => void): string {
  log(`[CareAgent] exec: ${command}`);
  try {
    return execSync(command, {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const msg = err instanceof Error ? (err as NodeJS.ErrnoException & { stderr?: string }).stderr || err.message : String(err);
    throw new Error(`Command failed: ${command}\n${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Check if CareAgent agent already exists
// ---------------------------------------------------------------------------

function agentExists(log: (msg: string) => void): boolean {
  try {
    const raw = execCli('openclaw agents list --json 2>/dev/null', log);
    // OpenClaw may emit warnings before the JSON array — extract the JSON
    const jsonStart = raw.indexOf('[');
    if (jsonStart === -1) return false;
    const agents = JSON.parse(raw.slice(jsonStart));
    return Array.isArray(agents)
      ? agents.some((a: { id?: string; name?: string }) => a.id === CAREAGENT_ID || a.name === CAREAGENT_ID)
      : false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ensure CareAgent agent exists (create if needed, tolerate "already exists")
// ---------------------------------------------------------------------------

function ensureAgent(
  clinicalWorkspacePath: string,
  log: (msg: string) => void,
  audit: AuditPipeline,
  traceId: string,
  options?: { model?: string },
): { ok: boolean; error?: string } {
  if (agentExists(log)) return { ok: true };

  try {
    const modelFlag = options?.model ? ` --model ${options.model}` : '';
    execCli(
      `openclaw agents add ${CAREAGENT_ID} --workspace ${clinicalWorkspacePath} --non-interactive${modelFlag}`,
      log,
    );
    audit.log({
      action: 'careagent_activate',
      actor: 'system',
      outcome: 'allowed',
      details: { step: 'agent_create', agent_id: CAREAGENT_ID },
      trace_id: traceId,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "already exists" is not a real error — the agentExists() check may
    // have returned a false negative due to CLI output parsing issues
    if (msg.includes('already exists')) {
      log('[CareAgent] Agent already exists (detected via add fallback)');
      return { ok: true };
    }
    audit.log({
      action: 'careagent_activate',
      actor: 'system',
      outcome: 'error',
      details: { step: 'agent_create', error: msg },
      trace_id: traceId,
    });
    return { ok: false, error: `Failed to create CareAgent agent: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Onboarding activation — no CANS.md, create agent with BOOTSTRAP.md
// ---------------------------------------------------------------------------

function runOnboardingActivation(
  workspacePath: string,
  audit: AuditPipeline,
  traceId: string,
  log: (msg: string) => void,
  options?: { model?: string },
): ActivateResult {
  const clinicalWorkspacePath = resolve(workspacePath, '..', CLINICAL_WORKSPACE_DIR);
  mkdirSync(clinicalWorkspacePath, { recursive: true });

  // Ensure agent exists
  const agentResult = ensureAgent(clinicalWorkspacePath, log, audit, traceId, options);
  if (!agentResult.ok) {
    return { success: false, error: agentResult.error };
  }

  // Write BOOTSTRAP.md
  const axonUrl = process.env['AXON_URL'];
  const bootstrapContent = generateOnboardingBootstrap(axonUrl ? { axonUrl } : undefined);
  const bootstrapPath = join(clinicalWorkspacePath, 'BOOTSTRAP.md');
  writeFileSync(bootstrapPath, bootstrapContent, 'utf-8');

  // Write CANS-SCHEMA.md
  const schemaContent = generateCansSchemaReference();
  const schemaPath = join(clinicalWorkspacePath, 'CANS-SCHEMA.md');
  writeFileSync(schemaPath, schemaContent, 'utf-8');

  // Bind Telegram to CareAgent, unbind from default
  try {
    execCli(`openclaw agents bind --agent ${CAREAGENT_ID} --bind telegram`, log);
    execCli('openclaw agents unbind --agent default --bind telegram', log);
    audit.log({
      action: 'careagent_activate',
      actor: 'system',
      outcome: 'allowed',
      details: { step: 'telegram_bind', bound_to: CAREAGENT_ID, mode: 'onboarding' },
      trace_id: traceId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.log({
      action: 'careagent_activate',
      actor: 'system',
      outcome: 'error',
      details: { step: 'telegram_bind', error: msg },
      trace_id: traceId,
    });
    log(`[CareAgent] Warning: Telegram binding failed — ${msg}`);
  }

  audit.log({
    action: 'careagent_activate',
    actor: 'provider',
    outcome: 'active',
    details: {
      step: 'onboarding_started',
      agent_id: CAREAGENT_ID,
      clinical_workspace: clinicalWorkspacePath,
    },
    trace_id: traceId,
  });

  log('[CareAgent] Onboarding mode ACTIVATED');
  log('[CareAgent] The CareAgent will now conduct your onboarding interview.');
  log('[CareAgent] Once complete, send /careagent_on again to activate clinical mode.');

  return { success: true, clinicalWorkspacePath, registered: false, onboarding: true };
}

// ---------------------------------------------------------------------------
// Clinical activation — CANS.md exists, full activation
// ---------------------------------------------------------------------------

async function runClinicalActivation(
  _workspacePath: string,
  clinicalWorkspacePath: string,
  audit: AuditPipeline,
  traceId: string,
  log: (msg: string) => void,
  profile?: WorkspaceProfile,
  options?: { model?: string },
): Promise<ActivateResult> {
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
    return { success: false, error: `Cannot activate: ${reason}` };
  }

  const cans = activation.document;

  // Ensure agent exists
  const agentResult = ensureAgent(clinicalWorkspacePath, log, audit, traceId, options);
  if (!agentResult.ok) {
    return { success: false, error: agentResult.error };
  }

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

  // Bind Telegram to CareAgent, unbind from default
  try {
    execCli(`openclaw agents bind --agent ${CAREAGENT_ID} --bind telegram`, log);
    execCli('openclaw agents unbind --agent default --bind telegram', log);
    audit.log({
      action: 'careagent_activate',
      actor: 'system',
      outcome: 'allowed',
      details: { step: 'telegram_bind', bound_to: CAREAGENT_ID },
      trace_id: traceId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.log({
      action: 'careagent_activate',
      actor: 'system',
      outcome: 'error',
      details: { step: 'telegram_bind', error: msg },
      trace_id: traceId,
    });
    log(`[CareAgent] Warning: Telegram binding failed — ${msg}`);
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

  log(`[CareAgent] Clinical mode ACTIVATED for ${cans.provider.name}`);
  log(`[CareAgent] Workspace: ${clinicalWorkspacePath}`);
  log('[CareAgent] Telegram is now routed to the CareAgent.');
  log('[CareAgent] Use /careagent_off to return to your personal agent.');

  return { success: true, clinicalWorkspacePath, registered };
}

// ---------------------------------------------------------------------------
// Main entry point — routes to onboarding or clinical activation
// ---------------------------------------------------------------------------

export async function runActivateCommand(
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,
  options?: { model?: string },
): Promise<ActivateResult> {
  const traceId = audit.createTraceId();
  const log = (msg: string) => console.log(msg);

  const clinicalWorkspacePath = resolve(workspacePath, '..', CLINICAL_WORKSPACE_DIR);
  const clinicalCansPath = join(clinicalWorkspacePath, 'CANS.md');
  const onboardingCansPath = join(workspacePath, 'CANS.md');
  const bootstrapPath = join(clinicalWorkspacePath, 'BOOTSTRAP.md');

  // Path 1: CANS.md exists in clinical workspace → clinical activation
  if (existsSync(clinicalCansPath)) {
    return runClinicalActivation(workspacePath, clinicalWorkspacePath, audit, traceId, log, profile, options);
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

    return runClinicalActivation(workspacePath, clinicalWorkspacePath, audit, traceId, log, profile, options);
  }

  // Path 3: BOOTSTRAP.md exists but no CANS.md → onboarding already in progress
  if (existsSync(bootstrapPath) && !existsSync(clinicalCansPath)) {
    log('[CareAgent] Onboarding is already in progress.');
    log('[CareAgent] Complete the interview with the CareAgent, then send /careagent_on again.');
    return { success: true, clinicalWorkspacePath, registered: false, onboarding: true };
  }

  // Path 4: Nothing exists → start onboarding
  return runOnboardingActivation(workspacePath, audit, traceId, log, options);
}
