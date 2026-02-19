/**
 * Refinement engine types — observation recording, divergence detection,
 * and proposal lifecycle management.
 *
 * Covers:
 * - CANS-08: Observation and divergence pattern types
 * - CANS-09: Proposal types with accept/reject/defer lifecycle
 * - Safety: SACROSANCT_FIELDS and isScopeField for scope protection
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum observation count before a divergence generates a proposal. */
export const DEFAULT_DIVERGENCE_THRESHOLD = 5;

/** Observation count required to resurface a previously rejected proposal. */
export const RESURFACE_THRESHOLD = 10;

// ---------------------------------------------------------------------------
// Observation Categories
// ---------------------------------------------------------------------------

export type ObservationCategory =
  | 'voice'
  | 'autonomy'
  | 'credential'
  | 'skill_usage'
  | 'identity';

/**
 * Maps observation categories to their corresponding CANS field paths.
 * Used by the pattern matcher to classify observations.
 */
export const CATEGORY_FIELDS: Record<ObservationCategory, string[]> = {
  voice: [
    'clinical_voice.tone',
    'clinical_voice.documentation_style',
    'clinical_voice.eponyms',
    'clinical_voice.abbreviations',
  ],
  autonomy: [
    'autonomy.chart',
    'autonomy.order',
    'autonomy.charge',
    'autonomy.perform',
  ],
  credential: [
    'provider.credential_status',
    'provider.institution',
  ],
  skill_usage: [
    // Dynamic: populated from skills.rules entries at runtime
  ],
  identity: [
    'provider.name',
    'provider.npi',
    'provider.specialty',
    'provider.subspecialty',
  ],
};

// ---------------------------------------------------------------------------
// Scope Protection
// ---------------------------------------------------------------------------

/**
 * Scope fields that are NEVER eligible for refinement proposals.
 * Defense layer 1: checked in pattern-matcher.
 * Defense layer 2: asserted in proposal-generator.
 */
export const SACROSANCT_FIELDS = new Set([
  'scope',
  'scope.permitted_actions',
  'scope.prohibited_actions',
  'scope.institutional_limitations',
]);

/**
 * Returns true if the given field path is a scope field.
 * Matches exact 'scope' or any path starting with 'scope.'.
 */
export function isScopeField(fieldPath: string): boolean {
  return fieldPath === 'scope' || fieldPath.startsWith('scope.');
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

export interface Observation {
  timestamp: string;
  session_id: string;
  category: ObservationCategory;
  field_path: string;
  declared_value: unknown;
  observed_value: unknown;
  context?: string;
}

// ---------------------------------------------------------------------------
// Divergence Pattern
// ---------------------------------------------------------------------------

export interface DivergencePattern {
  field_path: string;
  category: ObservationCategory;
  observation_count: number;
  declared_value: unknown;
  most_common_observed: unknown;
  evidence_summary: string;
}

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

export interface Proposal {
  id: string;
  created_at: string;
  field_path: string;
  category: ObservationCategory;
  current_value: unknown;
  proposed_value: unknown;
  evidence_summary: string;
  observation_count: number;
  status: 'pending' | 'accepted' | 'rejected' | 'deferred';
  resolved_at?: string;
  rejection_count?: number;
}

export type ProposalResolution = 'accept' | 'reject' | 'defer';
