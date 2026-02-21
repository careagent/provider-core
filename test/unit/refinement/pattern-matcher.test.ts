import { describe, it, expect } from 'vitest';
import { detectDivergences } from '../../../src/refinement/pattern-matcher.js';
import type { Observation, Proposal } from '../../../src/refinement/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObservation(overrides?: Partial<Observation>): Observation {
  return {
    timestamp: new Date().toISOString(),
    session_id: 'test-session',
    category: 'voice',
    field_path: 'voice.chart',
    declared_value: 'formal',
    observed_value: 'conversational',
    ...overrides,
  };
}

function makeProposal(overrides?: Partial<Proposal>): Proposal {
  return {
    id: 'test-proposal-001',
    created_at: new Date().toISOString(),
    field_path: 'voice.chart',
    category: 'voice',
    current_value: 'formal',
    proposed_value: 'conversational',
    evidence_summary: 'test evidence',
    observation_count: 5,
    status: 'pending',
    rejection_count: 0,
    ...overrides,
  };
}

/**
 * Create N observations for a given field path with a declared/observed divergence.
 */
function createDivergentObservations(
  count: number,
  overrides?: Partial<Observation>,
): Observation[] {
  return Array.from({ length: count }, () =>
    makeObservation({
      declared_value: 'formal',
      observed_value: 'conversational',
      ...overrides,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectDivergences', () => {
  it('produces a DivergencePattern when 5+ observations of same field diverge', () => {
    const observations = createDivergentObservations(5);

    const patterns = detectDivergences(observations, []);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].field_path).toBe('voice.chart');
    expect(patterns[0].observation_count).toBe(5);
    expect(patterns[0].declared_value).toBe('formal');
    expect(patterns[0].most_common_observed).toBe('conversational');
  });

  it('produces nothing when observation count is below threshold (4)', () => {
    const observations = createDivergentObservations(4);

    const patterns = detectDivergences(observations, []);

    expect(patterns).toHaveLength(0);
  });

  it('NEVER includes scope field observations regardless of count', () => {
    const scopeObs = createDivergentObservations(20, {
      field_path: 'scope.permitted_actions',
      category: 'identity',
      declared_value: ['chart_review'],
      observed_value: ['chart_review', 'prescribe'],
    });

    const patterns = detectDivergences(scopeObs, []);

    expect(patterns).toHaveLength(0);
  });

  it('excludes scope field with exact "scope" path', () => {
    const scopeObs = createDivergentObservations(10, {
      field_path: 'scope',
      category: 'identity',
      declared_value: { permitted: true },
      observed_value: { permitted: false },
    });

    const patterns = detectDivergences(scopeObs, []);
    expect(patterns).toHaveLength(0);
  });

  it('works with custom threshold (e.g., 3)', () => {
    const observations = createDivergentObservations(3);

    const patterns = detectDivergences(observations, [], 3);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].observation_count).toBe(3);
  });

  it('excludes field with existing pending proposal', () => {
    const observations = createDivergentObservations(6);
    const existingProposals = [makeProposal({ status: 'pending' })];

    const patterns = detectDivergences(observations, existingProposals);

    expect(patterns).toHaveLength(0);
  });

  it('excludes field with existing deferred proposal', () => {
    const observations = createDivergentObservations(6);
    const existingProposals = [makeProposal({ status: 'deferred' })];

    const patterns = detectDivergences(observations, existingProposals);

    expect(patterns).toHaveLength(0);
  });

  it('resurfaces rejected proposal only when count >= RESURFACE_THRESHOLD and exceeds previous count', () => {
    // 9 observations — below RESURFACE_THRESHOLD (10), should NOT resurface
    const observations9 = createDivergentObservations(9);
    const rejectedProposal = makeProposal({
      status: 'rejected',
      observation_count: 5,
      rejection_count: 1,
    });

    const patterns9 = detectDivergences(observations9, [rejectedProposal]);
    expect(patterns9).toHaveLength(0);

    // 10 observations — at RESURFACE_THRESHOLD and exceeds previous count (5), should resurface
    const observations10 = createDivergentObservations(10);

    const patterns10 = detectDivergences(observations10, [rejectedProposal]);
    expect(patterns10).toHaveLength(1);
    expect(patterns10[0].observation_count).toBe(10);
  });

  it('does not resurface rejected proposal when count does not exceed previous count', () => {
    const observations = createDivergentObservations(10);
    const rejectedProposal = makeProposal({
      status: 'rejected',
      observation_count: 10,
      rejection_count: 1,
    });

    const patterns = detectDivergences(observations, [rejectedProposal]);
    expect(patterns).toHaveLength(0);
  });

  it('generates human-readable evidence_summary', () => {
    const observations = createDivergentObservations(5);

    const patterns = detectDivergences(observations, []);

    expect(patterns[0].evidence_summary).toContain('5 of your last 5 voice events');
    expect(patterns[0].evidence_summary).toContain('"conversational"');
    expect(patterns[0].evidence_summary).toContain('"formal"');
  });

  it('sorts multiple fields by observation count descending', () => {
    const toneObs = createDivergentObservations(7, {
      field_path: 'voice.chart',
    });
    const autonomyObs = createDivergentObservations(10, {
      field_path: 'autonomy.chart',
      category: 'autonomy',
      declared_value: 'supervised',
      observed_value: 'autonomous',
    });
    const styleObs = createDivergentObservations(5, {
      field_path: 'voice.order',
      declared_value: 'structured',
      observed_value: 'narrative',
    });

    const allObs = [...toneObs, ...autonomyObs, ...styleObs];
    const patterns = detectDivergences(allObs, []);

    expect(patterns).toHaveLength(3);
    expect(patterns[0].field_path).toBe('autonomy.chart');
    expect(patterns[0].observation_count).toBe(10);
    expect(patterns[1].field_path).toBe('voice.chart');
    expect(patterns[1].observation_count).toBe(7);
    expect(patterns[2].field_path).toBe('voice.order');
    expect(patterns[2].observation_count).toBe(5);
  });

  it('only counts divergent observations (not matching ones)', () => {
    // 3 divergent + 5 matching = 8 total, but only 3 divergent (below default threshold 5)
    const divergent = createDivergentObservations(3);
    const matching = Array.from({ length: 5 }, () =>
      makeObservation({
        declared_value: 'formal',
        observed_value: 'formal', // same — no divergence
      }),
    );

    const patterns = detectDivergences([...divergent, ...matching], []);
    expect(patterns).toHaveLength(0);
  });

  it('uses deep comparison for object values', () => {
    const observations = createDivergentObservations(5, {
      field_path: 'provider.credential_status',
      category: 'credential',
      declared_value: ['surgery', 'consultation'],
      observed_value: ['surgery', 'consultation', 'teaching'],
    });

    const patterns = detectDivergences(observations, []);
    expect(patterns).toHaveLength(1);
  });

  it('allows accepted proposals to be re-evaluated as new divergences', () => {
    const observations = createDivergentObservations(6);
    const acceptedProposal = makeProposal({ status: 'accepted' });

    const patterns = detectDivergences(observations, [acceptedProposal]);
    expect(patterns).toHaveLength(1);
  });
});
