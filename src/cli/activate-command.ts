/**
 * CareAgent activate command — creates a separate CareAgent agent in
 * OpenClaw's multi-agent system, copies CANS.md to the clinical workspace,
 * supplements workspace files, binds Telegram, and runs neuron registration.
 *
 * Exposed as:
 * - `/careagent on` slash command (auto-reply, no LLM)
 * - `openclaw careagent activate` CLI command (deployment automation)
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ActivationGate } from '../activation/gate.js';
import { supplementWorkspaceFiles } from '../onboarding/workspace-writer.js';
import { openclawProfile } from '../onboarding/workspace-profiles.js';
import { registerProvider } from '../registration/registration.js';
import { loadProviderProfile } from '../credentials/profile.js';
import { createNeuronClient } from '../neuron/client.js';
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
    const output = execCli('openclaw agents list --json 2>/dev/null', log);
    const agents = JSON.parse(output);
    return Array.isArray(agents)
      ? agents.some((a: { id?: string; name?: string }) => a.id === CAREAGENT_ID || a.name === CAREAGENT_ID)
      : false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Activate command
// ---------------------------------------------------------------------------

export async function runActivateCommand(
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,
  options?: { model?: string },
): Promise<ActivateResult> {
  const traceId = audit.createTraceId();
  const log = (msg: string) => console.log(msg);

  // -------------------------------------------------------------------------
  // Step 1: Validate CANS.md in the onboarding workspace
  // -------------------------------------------------------------------------

  const gate = new ActivationGate(workspacePath, (entry) =>
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
      details: { step: 'gate_check', reason },
      trace_id: traceId,
    });
    return { success: false, error: `Cannot activate: ${reason}` };
  }

  const cans = activation.document;

  // -------------------------------------------------------------------------
  // Step 2: Create the CareAgent agent (if it doesn't already exist)
  // -------------------------------------------------------------------------

  const clinicalWorkspacePath = resolve(workspacePath, '..', CLINICAL_WORKSPACE_DIR);
  mkdirSync(clinicalWorkspacePath, { recursive: true });

  if (!agentExists(log)) {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      audit.log({
        action: 'careagent_activate',
        actor: 'system',
        outcome: 'error',
        details: { step: 'agent_create', error: msg },
        trace_id: traceId,
      });
      return { success: false, error: `Failed to create CareAgent agent: ${msg}` };
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Copy CANS.md + integrity hash to clinical workspace
  // -------------------------------------------------------------------------

  try {
    const cansSource = join(workspacePath, 'CANS.md');
    const cansDest = join(clinicalWorkspacePath, 'CANS.md');
    copyFileSync(cansSource, cansDest);

    const integrityDir = join(clinicalWorkspacePath, '.careagent');
    mkdirSync(integrityDir, { recursive: true });

    const integritySource = join(workspacePath, '.careagent', 'cans-integrity.json');
    if (existsSync(integritySource)) {
      copyFileSync(integritySource, join(integrityDir, 'cans-integrity.json'));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to copy CANS.md: ${msg}` };
  }

  // -------------------------------------------------------------------------
  // Step 4: Generate clinical workspace files
  // -------------------------------------------------------------------------

  const resolvedProfile = profile ?? openclawProfile;
  const philosophy = cans.provider.specialty
    ? `Clinical agent for ${cans.provider.name}, specializing in ${cans.provider.specialty}`
    : `Clinical agent for ${cans.provider.name}`;

  supplementWorkspaceFiles(clinicalWorkspacePath, cans, philosophy, resolvedProfile);

  // -------------------------------------------------------------------------
  // Step 5: Bind Telegram to CareAgent, unbind from default
  // -------------------------------------------------------------------------

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
    // Non-fatal: agent was created, binding can be retried
    log(`[CareAgent] Warning: Telegram binding failed — ${msg}`);
  }

  // -------------------------------------------------------------------------
  // Step 6: Register with neuron (first activation only)
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Step 7: Confirm activation
  // -------------------------------------------------------------------------

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
  log('[CareAgent] Use /careagent-off to return to your personal agent.');

  return { success: true, clinicalWorkspacePath, registered };
}
