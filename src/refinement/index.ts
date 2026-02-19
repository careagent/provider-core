/**
 * Refinement module — public API re-exports.
 *
 * Provides the complete refinement engine for CANS.md continuous improvement:
 * - Observation recording and storage
 * - Divergence pattern detection
 * - Proposal generation with scope field protection
 * - Proposal lifecycle management
 * - Top-level orchestrator (RefinementEngine)
 */

// Types and constants
export type {
  Observation,
  Proposal,
  DivergencePattern,
  ObservationCategory,
  ProposalResolution,
} from './types.js';

export {
  DEFAULT_DIVERGENCE_THRESHOLD,
  RESURFACE_THRESHOLD,
  SACROSANCT_FIELDS,
  isScopeField,
  CATEGORY_FIELDS,
} from './types.js';

// Observation store
export { ObservationStore } from './observation-store.js';

// Proposal queue
export { ProposalQueue } from './proposal-queue.js';

// Pattern matcher
export { detectDivergences } from './pattern-matcher.js';

// Proposal generator
export {
  generateProposals as generateProposalsFromDivergences,
  generateDiffView,
} from './proposal-generator.js';

// Refinement engine (orchestrator)
export { createRefinementEngine } from './refinement-engine.js';
export type { RefinementEngine } from './refinement-engine.js';
