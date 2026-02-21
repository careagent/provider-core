/**
 * Layer 1: Tool Policy Lockdown (HARD-01)
 *
 * Pure, stateless function that checks whether a tool call is permitted
 * based on the CANS scope's permitted_actions (whitelist-only model).
 *
 * Evaluation order:
 * 1. If tool NOT in permitted_actions -> deny
 * 2. Otherwise -> allow
 *
 * Hardening is always on (deterministic, hardcoded in plugin).
 * prohibited_actions and institutional_limitations removed — whitelist only.
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'tool-policy';

export function checkToolPolicy(
  event: ToolCallEvent,
  cans: CANSDocument,
): HardeningLayerResult {
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
