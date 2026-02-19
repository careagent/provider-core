/**
 * Layer 2: Exec Allowlist (HARD-02)
 *
 * Pure, stateless function that controls which shell binaries are permitted
 * when the agent executes Bash/exec tool calls.
 *
 * Evaluation order:
 * 1. If exec_approval disabled -> pass-through
 * 2. If not a Bash/exec tool call -> pass-through (not an exec call)
 * 3. Extract first token from command
 * 4. If empty -> deny
 * 5. If token in BASE_ALLOWLIST -> allow
 * 6. Otherwise -> deny
 *
 * The allowlist is conservative: read-only utilities and git.
 * Additional binaries can be added per-installation in future phases.
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'exec-allowlist';

/** Conservative base allowlist: read-only utilities + git. */
const ALLOWED_BINARIES = [
  'cat', 'ls', 'head', 'tail', 'wc', 'git', 'grep', 'find', 'echo', 'sort', 'uniq', 'diff',
];

const BASE_ALLOWLIST = new Set<string>([
  // Bare names
  ...ALLOWED_BINARIES,
  // /bin/ paths
  ...ALLOWED_BINARIES.map((b) => `/bin/${b}`),
  // /usr/bin/ paths
  ...ALLOWED_BINARIES.map((b) => `/usr/bin/${b}`),
]);

/** Tool names treated as exec calls. */
const EXEC_TOOL_NAMES = new Set(['Bash', 'exec']);

export function checkExecAllowlist(
  event: ToolCallEvent,
  cans: CANSDocument,
): HardeningLayerResult {
  if (!cans.hardening.exec_approval) {
    return { layer: LAYER_NAME, allowed: true, reason: 'exec_approval disabled' };
  }

  if (!EXEC_TOOL_NAMES.has(event.toolName)) {
    return { layer: LAYER_NAME, allowed: true, reason: 'not an exec call' };
  }

  const command = typeof event.params?.command === 'string'
    ? event.params.command.trim()
    : '';

  if (command.length === 0) {
    return {
      layer: LAYER_NAME,
      allowed: false,
      reason: 'empty exec command',
    };
  }

  const firstToken = command.split(/\s+/)[0];

  if (BASE_ALLOWLIST.has(firstToken)) {
    return { layer: LAYER_NAME, allowed: true };
  }

  return {
    layer: LAYER_NAME,
    allowed: false,
    reason: `Binary '${firstToken}' is not in the exec allowlist`,
  };
}
