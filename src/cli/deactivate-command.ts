/**
 * CareAgent deactivate command — removes peer-level binding and returns
 * routing to the default agent.
 *
 * Does NOT delete the CareAgent agent or clinical workspace — state is
 * preserved for the next `/careagent_on`.
 *
 * Binding management uses direct filesystem writes via config-manager
 * instead of `openclaw agents unbind/bind` CLI calls.
 *
 * Exposed as:
 * - `/careagent_off` slash command (auto-reply, no LLM)
 * - `openclaw careagent deactivate` CLI command (deployment automation)
 */

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
// Deactivate command
// ---------------------------------------------------------------------------

/**
 * Deactivates CareAgent clinical mode.
 *
 * The slash command handler in openclaw.ts handles peer-level binding removal
 * directly (it has access to senderId). This function handles audit logging
 * for the CLI path and can be extended for non-Telegram deactivation flows.
 */
export async function runDeactivateCommand(
  audit: AuditPipeline,
): Promise<DeactivateResult> {
  const traceId = audit.createTraceId();

  audit.log({
    action: 'careagent_deactivate',
    actor: 'provider',
    outcome: 'inactive',
    details: { step: 'complete', agent_id: CAREAGENT_ID },
    trace_id: traceId,
  });

  console.log('[CareAgent] Clinical mode DEACTIVATED');
  console.log('[CareAgent] Use /careagent_on to re-enter clinical mode.');

  return { success: true };
}
