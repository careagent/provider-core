/**
 * Layer 1: Tool Policy Lockdown (HARD-01)
 *
 * Pure, stateless function that checks whether a tool call is permitted
 * based on the CANS scope's permitted_actions and prohibited_actions lists.
 *
 * Evaluation order:
 * 1. If tool_policy_lockdown disabled -> pass-through
 * 2. If tool in prohibited_actions -> deny (prohibited trumps permitted)
 * 3. If tool NOT in permitted_actions -> deny (allowlist model)
 * 4. Otherwise -> allow
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'tool-policy';

export function checkToolPolicy(
  event: ToolCallEvent,
  cans: CANSDocument,
): HardeningLayerResult {
  if (!cans.hardening.tool_policy_lockdown) {
    return { layer: LAYER_NAME, allowed: true, reason: 'tool_policy_lockdown disabled' };
  }

  const prohibited = cans.scope.prohibited_actions ?? [];
  if (prohibited.includes(event.toolName)) {
    return {
      layer: LAYER_NAME,
      allowed: false,
      reason: `Tool '${event.toolName}' is in prohibited_actions`,
    };
  }

  const permitted = cans.scope.permitted_actions;
  if (!permitted.includes(event.toolName)) {
    return {
      layer: LAYER_NAME,
      allowed: false,
      reason: `Tool '${event.toolName}' is not in permitted_actions`,
    };
  }

  return { layer: LAYER_NAME, allowed: true };
}
