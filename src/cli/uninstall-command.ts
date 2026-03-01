/**
 * CareAgent uninstall command — cleanly removes the CareAgent agent,
 * all bindings, and optionally the clinical workspace.
 *
 * Exposed as: `openclaw careagent uninstall` CLI command.
 */

import { execSync } from 'node:child_process';
import type { AuditPipeline } from '../audit/pipeline.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAREAGENT_ID = 'careagent-provider';

// ---------------------------------------------------------------------------
// Uninstall result
// ---------------------------------------------------------------------------

export interface UninstallResult {
  success: boolean;
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
// Uninstall command
// ---------------------------------------------------------------------------

export async function runUninstallCommand(
  audit: AuditPipeline,
): Promise<UninstallResult> {
  const traceId = audit.createTraceId();
  const log = (msg: string) => console.log(msg);

  // -------------------------------------------------------------------------
  // Step 1: Unbind all bindings from CareAgent
  // -------------------------------------------------------------------------

  try {
    execCli(`openclaw agents unbind --agent ${CAREAGENT_ID} --all`, log);
  } catch {
    // Agent might not exist or have no bindings — continue
  }

  // -------------------------------------------------------------------------
  // Step 2: Rebind Telegram to default (safety net)
  // -------------------------------------------------------------------------

  try {
    execCli('openclaw agents bind --agent default --bind telegram', log);
  } catch {
    // Best effort — default agent may already have telegram
  }

  // -------------------------------------------------------------------------
  // Step 3: Delete the CareAgent agent
  // -------------------------------------------------------------------------

  try {
    execCli(`openclaw agents delete ${CAREAGENT_ID} --force`, log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.log({
      action: 'careagent_uninstall',
      actor: 'provider',
      outcome: 'error',
      details: { step: 'agent_delete', error: msg },
      trace_id: traceId,
    });
    return { success: false, error: `Failed to delete CareAgent agent: ${msg}` };
  }

  // -------------------------------------------------------------------------
  // Step 4: Confirm uninstall
  // -------------------------------------------------------------------------

  audit.log({
    action: 'careagent_uninstall',
    actor: 'provider',
    outcome: 'inactive',
    details: { step: 'complete', agent_id: CAREAGENT_ID },
    trace_id: traceId,
  });

  log('[CareAgent] CareAgent agent removed');
  log('[CareAgent] Telegram bindings restored to default agent');
  log('[CareAgent] Clinical workspace preserved (delete manually if desired)');

  return { success: true };
}
