/**
 * Proposal Generator — creates Proposal objects from detected divergence patterns.
 *
 * Each DivergencePattern is mapped to a Proposal with a UUID, pending status,
 * evidence summary, and current/proposed values.
 *
 * Safety invariant (defense layer 2): asserts that no scope field leaks through
 * from the pattern matcher. This should never trigger if the pattern matcher is
 * correct, but provides defense in depth per research.
 */

import { randomUUID } from 'node:crypto';
import { isScopeField } from './types.js';
import type { DivergencePattern, Proposal } from './types.js';

/**
 * Create proposals from detected divergence patterns.
 *
 * @param divergences - DivergencePattern array from detectDivergences()
 * @param sessionId - Current session ID for tracing
 * @returns Proposal array with pending status
 * @throws Error if a scope field leaks through (defense layer 2)
 */
export function generateProposals(
  divergences: DivergencePattern[],
  sessionId: string,
): Proposal[] {
  return divergences.map((divergence) => {
    // CRITICAL safety check (defense layer 2):
    // Assert no scope field leaks through from the pattern matcher.
    if (isScopeField(divergence.field_path)) {
      throw new Error(
        `SAFETY VIOLATION: Scope field "${divergence.field_path}" leaked into proposal generation. ` +
        `Scope fields are sacrosanct and must never be proposed for change.`,
      );
    }

    const proposal: Proposal = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      field_path: divergence.field_path,
      category: divergence.category,
      current_value: divergence.declared_value,
      proposed_value: divergence.most_common_observed,
      evidence_summary: divergence.evidence_summary,
      observation_count: divergence.observation_count,
      status: 'pending',
      rejection_count: 0,
    };

    return proposal;
  });
}

/**
 * Generate a simple field-level diff view for a proposal.
 *
 * Shows what would change in CANS.md in a unified diff-like format.
 */
export function generateDiffView(proposal: Proposal): string {
  return [
    '--- CANS.md (current)',
    '+++ CANS.md (proposed)',
    `@@ ${proposal.field_path} @@`,
    `- ${formatValue(proposal.current_value)}`,
    `+ ${formatValue(proposal.proposed_value)}`,
  ].join('\n');
}

/**
 * Format a value for diff display.
 * Uses JSON.stringify for objects/arrays, direct string conversion for primitives.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}
