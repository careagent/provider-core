/**
 * Layer 3: CANS Protocol Injection (HARD-03)
 *
 * Extracts clinical hard rules from the CANS document and injects them
 * into the agent's system prompt via the bootstrap hook. The per-check
 * function is a non-blocking pass-through that reports injection status
 * for engine composition.
 *
 * Hardening is always on (deterministic, hardcoded in plugin).
 */

import type { ToolCallEvent } from '../../adapters/types.js';
import type { BootstrapContext } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'cans-injection';

/**
 * Extract concise clinical protocol rules from CANS document.
 *
 * Output is kept under 500 tokens (~2000 characters) to avoid
 * consuming excessive context window in the agent's system prompt.
 */
export function extractProtocolRules(cans: CANSDocument): string {
  const lines: string[] = [];
  lines.push('# CareAgent Clinical Protocol');
  lines.push('');

  // Provider summary — use types and primary org
  const primaryOrg = cans.provider.organizations.find((o) => o.primary) ?? cans.provider.organizations[0];
  lines.push(`Provider: ${cans.provider.name} (${cans.provider.types.join(', ')})`);
  if (cans.provider.specialty) {
    lines.push(`Specialty: ${cans.provider.specialty}`);
  }
  if (cans.provider.subspecialty) {
    lines.push(`Subspecialty: ${cans.provider.subspecialty}`);
  }
  if (primaryOrg) {
    lines.push(`Organization: ${primaryOrg.name}`);
  }
  lines.push('');
  lines.push('## Scope Boundaries (HARD RULES)');
  lines.push(`Permitted: ${cans.scope.permitted_actions.join(', ')}`);
  lines.push('');
  lines.push('## Autonomy Tiers');
  lines.push(
    `Chart: ${cans.autonomy.chart} | Order: ${cans.autonomy.order} | Charge: ${cans.autonomy.charge} | Perform: ${cans.autonomy.perform}`,
  );
  lines.push(
    `Interpret: ${cans.autonomy.interpret} | Educate: ${cans.autonomy.educate} | Coordinate: ${cans.autonomy.coordinate}`,
  );
  lines.push('');
  lines.push('NEVER act outside these scope boundaries. If uncertain, ASK the provider.');
  return lines.join('\n');
}

/**
 * Inject clinical protocol rules into the agent's bootstrap context.
 *
 * Called during agent bootstrap (HARD-03). Writes protocol rules as
 * CAREAGENT_PROTOCOL.md so the agent has scope awareness from startup.
 */
export function injectProtocol(context: BootstrapContext, cans: CANSDocument): void {
  const rules = extractProtocolRules(cans);
  context.addFile('CAREAGENT_PROTOCOL.md', rules);
}

/**
 * Per-call check function for engine composition.
 *
 * Layer 3 never blocks tool calls -- it acts at bootstrap time.
 * This function reports that protocol injection is active.
 */
export function checkCansInjection(
  _event: ToolCallEvent,
  _cans: CANSDocument,
): HardeningLayerResult {
  return { layer: LAYER_NAME, allowed: true, reason: 'protocol injected at bootstrap' };
}
