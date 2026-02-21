import { describe, it, expect } from 'vitest';
import { generateProposals, generateDiffView } from '../../../src/refinement/proposal-generator.js';
import type { DivergencePattern } from '../../../src/refinement/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDivergence(overrides?: Partial<DivergencePattern>): DivergencePattern {
  return {
    field_path: 'voice.chart',
    category: 'voice',
    observation_count: 7,
    declared_value: 'formal',
    most_common_observed: 'conversational',
    evidence_summary: '7 of your last 10 voice events showed "conversational" instead of your declared "formal"',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: generateProposals
// ---------------------------------------------------------------------------

describe('generateProposals', () => {
  it('creates a proposal from a DivergencePattern', () => {
    const divergence = makeDivergence();
    const proposals = generateProposals([divergence], 'session-001');

    expect(proposals).toHaveLength(1);

    const proposal = proposals[0];
    expect(proposal.field_path).toBe('voice.chart');
    expect(proposal.category).toBe('voice');
    expect(proposal.current_value).toBe('formal');
    expect(proposal.proposed_value).toBe('conversational');
    expect(proposal.evidence_summary).toContain('7 of your last 10');
    expect(proposal.observation_count).toBe(7);
  });

  it('proposal has UUID id, pending status, and rejection_count 0', () => {
    const divergence = makeDivergence();
    const proposals = generateProposals([divergence], 'session-001');

    const proposal = proposals[0];
    // UUID format: 8-4-4-4-12 hex digits
    expect(proposal.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(proposal.status).toBe('pending');
    expect(proposal.rejection_count).toBe(0);
    expect(proposal.created_at).toBeTruthy();
  });

  it('throws if scope field leaks into divergences (defense layer 2)', () => {
    const scopeDivergence = makeDivergence({
      field_path: 'scope.permitted_actions',
    });

    expect(() => generateProposals([scopeDivergence], 'session-001')).toThrow(
      'SAFETY VIOLATION',
    );
    expect(() => generateProposals([scopeDivergence], 'session-001')).toThrow(
      'scope.permitted_actions',
    );
  });

  it('throws for exact "scope" field path', () => {
    const scopeDivergence = makeDivergence({ field_path: 'scope' });

    expect(() => generateProposals([scopeDivergence], 'session-001')).toThrow(
      'SAFETY VIOLATION',
    );
  });

  it('creates multiple proposals from multiple divergences', () => {
    const divergences: DivergencePattern[] = [
      makeDivergence({ field_path: 'voice.chart', observation_count: 8 }),
      makeDivergence({
        field_path: 'autonomy.chart',
        category: 'autonomy',
        observation_count: 6,
        declared_value: 'supervised',
        most_common_observed: 'autonomous',
      }),
      makeDivergence({
        field_path: 'provider.specialty',
        category: 'identity',
        observation_count: 5,
        declared_value: 'Old Specialty',
        most_common_observed: 'New Specialty',
      }),
    ];

    const proposals = generateProposals(divergences, 'session-001');

    expect(proposals).toHaveLength(3);
    expect(proposals[0].field_path).toBe('voice.chart');
    expect(proposals[1].field_path).toBe('autonomy.chart');
    expect(proposals[2].field_path).toBe('provider.specialty');

    // Each should have a unique ID
    const ids = new Set(proposals.map((p) => p.id));
    expect(ids.size).toBe(3);
  });

  it('returns empty array for empty divergences', () => {
    const proposals = generateProposals([], 'session-001');
    expect(proposals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: generateDiffView
// ---------------------------------------------------------------------------

describe('generateDiffView', () => {
  it('produces correct diff format for string values', () => {
    const proposals = generateProposals([makeDivergence()], 'session-001');
    const diff = generateDiffView(proposals[0]);

    expect(diff).toContain('--- CANS.md (current)');
    expect(diff).toContain('+++ CANS.md (proposed)');
    expect(diff).toContain('@@ voice.chart @@');
    expect(diff).toContain('- formal');
    expect(diff).toContain('+ conversational');
  });

  it('produces correct diff format for object values', () => {
    const divergence = makeDivergence({
      field_path: 'provider.credential_status',
      declared_value: ['surgery', 'consultation'],
      most_common_observed: ['surgery', 'consultation', 'teaching'],
    });
    const proposals = generateProposals([divergence], 'session-001');
    const diff = generateDiffView(proposals[0]);

    expect(diff).toContain('@@ provider.credential_status @@');
    expect(diff).toContain('- ["surgery","consultation"]');
    expect(diff).toContain('+ ["surgery","consultation","teaching"]');
  });

  it('handles boolean values', () => {
    const divergence = makeDivergence({
      field_path: 'voice.educate',
      declared_value: true,
      most_common_observed: false,
    });
    const proposals = generateProposals([divergence], 'session-001');
    const diff = generateDiffView(proposals[0]);

    expect(diff).toContain('- true');
    expect(diff).toContain('+ false');
  });
});
