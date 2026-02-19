/**
 * Pattern Matcher — detects divergence patterns between CANS.md declarations
 * and observed provider behavior.
 *
 * Groups observations by field_path, counts divergences (where declared !== observed),
 * and returns DivergencePattern objects for groups exceeding the threshold.
 *
 * Safety invariant: Scope fields are NEVER included in divergence detection.
 * This is defense layer 1. See proposal-generator.ts for defense layer 2.
 */

import {
  DEFAULT_DIVERGENCE_THRESHOLD,
  RESURFACE_THRESHOLD,
  isScopeField,
} from './types.js';
import type {
  Observation,
  Proposal,
  DivergencePattern,
  ObservationCategory,
} from './types.js';

/**
 * Detect divergence patterns from observations.
 *
 * Algorithm:
 * 1. Group observations by field_path
 * 2. For each group, count observations where declared_value !== observed_value
 * 3. Filter to groups with divergence count >= threshold
 * 4. CRITICAL: Exclude scope fields (isScopeField check)
 * 5. Exclude field_paths with existing pending or deferred proposals
 * 6. Allow resurfacing of rejected proposals only when count >= RESURFACE_THRESHOLD
 * 7. Determine most_common_observed (mode) for each group
 * 8. Generate human-readable evidence_summary
 *
 * @returns DivergencePattern array sorted by observation_count descending
 */
export function detectDivergences(
  observations: Observation[],
  existingProposals: Proposal[],
  threshold: number = DEFAULT_DIVERGENCE_THRESHOLD,
): DivergencePattern[] {
  // Step 1: Group observations by field_path
  const groups = new Map<string, Observation[]>();

  for (const obs of observations) {
    const existing = groups.get(obs.field_path);
    if (existing) {
      existing.push(obs);
    } else {
      groups.set(obs.field_path, [obs]);
    }
  }

  const patterns: DivergencePattern[] = [];

  for (const [fieldPath, fieldObs] of groups) {
    // Step 4: CRITICAL safety check — skip scope fields entirely
    if (isScopeField(fieldPath)) {
      continue;
    }

    // Step 2: Count observations where declared !== observed
    const divergent = fieldObs.filter(
      (obs) => JSON.stringify(obs.declared_value) !== JSON.stringify(obs.observed_value),
    );

    // Step 3: Filter to groups meeting threshold
    if (divergent.length < threshold) {
      continue;
    }

    // Step 5: Check existing proposals for this field_path
    const existingProposal = existingProposals.find((p) => p.field_path === fieldPath);

    if (existingProposal) {
      // Exclude if pending or deferred
      if (existingProposal.status === 'pending' || existingProposal.status === 'deferred') {
        continue;
      }

      // Step 6: Resurfacing logic for rejected proposals
      if (existingProposal.status === 'rejected') {
        if (
          divergent.length < RESURFACE_THRESHOLD ||
          divergent.length <= (existingProposal.observation_count ?? 0)
        ) {
          continue;
        }
      }
    }

    // Step 7: Determine most_common_observed (mode of observed_value)
    const valueCounts = new Map<string, { value: unknown; count: number }>();
    for (const obs of divergent) {
      const key = JSON.stringify(obs.observed_value);
      const entry = valueCounts.get(key);
      if (entry) {
        entry.count++;
      } else {
        valueCounts.set(key, { value: obs.observed_value, count: 1 });
      }
    }

    let mostCommon: { value: unknown; count: number } = { value: undefined, count: 0 };
    for (const entry of valueCounts.values()) {
      if (entry.count > mostCommon.count) {
        mostCommon = entry;
      }
    }

    // Determine category from the first observation in the group
    const category: ObservationCategory = fieldObs[0].category;

    // The declared value comes from the first divergent observation
    const declaredValue = divergent[0].declared_value;

    // Step 8: Generate human-readable evidence summary
    const totalObs = fieldObs.length;
    const evidenceSummary =
      `${divergent.length} of your last ${totalObs} ${category} events showed ` +
      `${formatValueForSummary(mostCommon.value)} instead of your declared ${formatValueForSummary(declaredValue)}`;

    patterns.push({
      field_path: fieldPath,
      category,
      observation_count: divergent.length,
      declared_value: declaredValue,
      most_common_observed: mostCommon.value,
      evidence_summary: evidenceSummary,
    });
  }

  // Sort by observation_count descending
  patterns.sort((a, b) => b.observation_count - a.observation_count);

  return patterns;
}

/**
 * Format a value for use in an evidence summary string.
 */
function formatValueForSummary(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  return JSON.stringify(value);
}
