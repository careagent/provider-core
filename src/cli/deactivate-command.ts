/**
 * CareAgent deactivate command — unbinds Telegram from the CareAgent
 * and returns routing to the default agent.
 *
 * Does NOT delete the CareAgent agent or clinical workspace — state is
 * preserved for the next `/careagent on`.
 *
 * Exposed as:
 * - `/careagent off` slash command (auto-reply, no LLM)
 * - `openclaw careagent deactivate` CLI command (deployment automation)
 */

import { execSync } from 'node:child_process';
import type { AuditPipeline } from '../audit/pipeline.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAREAGENT_ID = 'careagent-provider';

// ---------------------------------------------------------------------------
// Deactivation result
// ---------------------------------------------------------------------------

export interface DeactivateResult {
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
// Deactivate command
// ---------------------------------------------------------------------------

export async function runDeactivateCommand(
  audit: AuditPipeline,
): Promise<DeactivateResult> {
  const traceId = audit.createTraceId();
  const log = (msg: string) => console.log(msg);

  // -------------------------------------------------------------------------
  // Step 1: Unbind Telegram from CareAgent
  // -------------------------------------------------------------------------

  try {
    execCli(`openclaw agents unbind --agent ${CAREAGENT_ID} --bind telegram`, log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.log({
      action: 'careagent_deactivate',
      actor: 'provider',
      outcome: 'error',
      details: { step: 'unbind_careagent', error: msg },
      trace_id: traceId,
    });
    return { success: false, error: `Failed to unbind CareAgent: ${msg}` };
  }

  // -------------------------------------------------------------------------
  // Step 2: Bind Telegram back to default agent
  // -------------------------------------------------------------------------

  try {
    execCli('openclaw agents bind --agent default --bind telegram', log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.log({
      action: 'careagent_deactivate',
      actor: 'provider',
      outcome: 'error',
      details: { step: 'bind_default', error: msg },
      trace_id: traceId,
    });
    return { success: false, error: `Failed to rebind default agent: ${msg}` };
  }

  // -------------------------------------------------------------------------
  // Step 3: Confirm deactivation
  // -------------------------------------------------------------------------

  audit.log({
    action: 'careagent_deactivate',
    actor: 'provider',
    outcome: 'inactive',
    details: { step: 'complete', agent_id: CAREAGENT_ID },
    trace_id: traceId,
  });

  log('[CareAgent] Clinical mode DEACTIVATED');
  log('[CareAgent] Telegram is now routed to your personal agent.');
  log('[CareAgent] Use /careagent on to re-enter clinical mode.');

  return { success: true };
}
