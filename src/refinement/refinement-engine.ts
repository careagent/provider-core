/**
 * RefinementEngine — top-level orchestrator composing observation store,
 * pattern matcher, proposal generator, and proposal queue into a single API.
 *
 * Covers:
 * - CANS-08: Usage observation recording and divergence detection
 * - CANS-09: Proposal lifecycle management with CANS.md write-back
 * - CANS-10: Audit logging for every proposal lifecycle event
 * - Safety: Defense layer 3 — scope field protection at applyProposal
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { ObservationStore } from './observation-store.js';
import { ProposalQueue } from './proposal-queue.js';
import { detectDivergences } from './pattern-matcher.js';
import { generateProposals } from './proposal-generator.js';
import { isScopeField } from './types.js';
import type { Observation, Proposal, ProposalResolution } from './types.js';
import { parseFrontmatter } from '../activation/cans-parser.js';
import { CANSSchema } from '../activation/cans-schema.js';
import { stringifyYAML } from '../vendor/yaml/index.js';
import { updateKnownGoodHash } from '../activation/cans-integrity.js';
import type { AuditPipeline } from '../audit/pipeline.js';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface RefinementEngine {
  /** Record a usage observation with auto-generated timestamp and session_id. */
  observe(obs: Omit<Observation, 'timestamp' | 'session_id'>): void;

  /** Detect divergence patterns and create new proposals. */
  generateProposals(): Proposal[];

  /** Return pending + deferred proposals for presentation. */
  getPendingProposals(): Proposal[];

  /** Accept, reject, or defer a proposal. */
  resolveProposal(proposalId: string, action: ProposalResolution): void;

  /** Look up a proposal by ID. */
  getProposalById(id: string): Proposal | undefined;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface RefinementEngineConfig {
  workspacePath: string;
  audit: AuditPipeline;
  sessionId: string;
}

export function createRefinementEngine(config: RefinementEngineConfig): RefinementEngine {
  const store = new ObservationStore(config.workspacePath);
  const queue = new ProposalQueue(config.workspacePath);

  return {
    observe(obs: Omit<Observation, 'timestamp' | 'session_id'>): void {
      const fullObs: Observation = {
        ...obs,
        timestamp: new Date().toISOString(),
        session_id: config.sessionId,
      };
      store.append(fullObs);
    },

    generateProposals(): Proposal[] {
      const observations = store.query();
      const existingProposals = queue.getPending();
      const divergences = detectDivergences(observations, existingProposals);
      const newProposals = generateProposals(divergences, config.sessionId);

      for (const proposal of newProposals) {
        queue.add(proposal);
        config.audit.log({
          action: 'cans_proposal_created',
          actor: 'system',
          outcome: 'allowed',
          details: {
            proposal_id: proposal.id,
            field_path: proposal.field_path,
            category: proposal.category,
            observation_count: proposal.observation_count,
            evidence_summary: proposal.evidence_summary,
          },
        });
      }

      return newProposals;
    },

    getPendingProposals(): Proposal[] {
      return queue.getPending();
    },

    resolveProposal(proposalId: string, action: ProposalResolution): void {
      const proposal = queue.getById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal not found: ${proposalId}`);
      }

      // Capture values before resolution modifies them
      const fieldPath = proposal.field_path;
      const currentValue = proposal.current_value;
      const proposedValue = proposal.proposed_value;

      queue.resolve(proposalId, action);

      if (action === 'accept') {
        applyProposal(config.workspacePath, proposal, config.audit);
      }

      // Audit log the resolution
      const actionSuffix = action === 'accept' ? 'accepted'
        : action === 'reject' ? 'rejected'
        : 'deferred';

      const actionState = action === 'accept' ? 'provider-approved'
        : action === 'reject' ? 'provider-rejected'
        : 'provider-modified';

      config.audit.log({
        action: `cans_proposal_${actionSuffix}`,
        actor: 'provider',
        outcome: 'allowed',
        action_state: actionState as 'provider-approved',
        details: {
          proposal_id: proposalId,
          field_path: fieldPath,
          current_value: currentValue,
          proposed_value: proposedValue,
        },
      });
    },

    getProposalById(id: string): Proposal | undefined {
      return queue.getById(id);
    },
  };
}

// ---------------------------------------------------------------------------
// Internal: Apply accepted proposal to CANS.md
// ---------------------------------------------------------------------------

/**
 * Set a value at a dot-separated path on a nested object.
 * e.g., setNestedValue(obj, 'voice.chart', 'formal')
 * sets obj.voice.chart = 'formal'.
 */
function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const keys = dotPath.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Apply an accepted proposal to CANS.md.
 *
 * Safety invariant (defense layer 3): scope fields are rejected with an error.
 * This is the third independent check after pattern-matcher (layer 1) and
 * proposal-generator (layer 2).
 */
function applyProposal(workspacePath: string, proposal: Proposal, _audit: AuditPipeline): void {
  // CRITICAL safety check (defense layer 3):
  if (isScopeField(proposal.field_path)) {
    throw new Error('SAFETY VIOLATION: Cannot modify scope fields');
  }

  // 1. Read CANS.md
  const cansPath = join(workspacePath, 'CANS.md');
  const raw = readFileSync(cansPath, 'utf-8');

  // 2. Parse frontmatter
  const parsed = parseFrontmatter(raw);
  if (!parsed.frontmatter) {
    throw new Error(`Cannot parse CANS.md frontmatter: ${parsed.error}`);
  }

  // 3. Apply field change via dot-path navigation
  setNestedValue(parsed.frontmatter, proposal.field_path, proposal.proposed_value);

  // 4. Validate against CANSSchema
  if (!Value.Check(CANSSchema, parsed.frontmatter)) {
    const errors = [...Value.Errors(CANSSchema, parsed.frontmatter)];
    const errorDetails = errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`CANS.md validation failed after applying proposal: ${errorDetails}`);
  }

  // 5. Serialize to YAML
  const yaml = stringifyYAML(parsed.frontmatter);

  // 6. Reconstruct content
  const content = `---\n${yaml}---\n\n${parsed.body}`;

  // 7. Write to disk
  writeFileSync(cansPath, content, 'utf-8');

  // 8. Update integrity hash
  updateKnownGoodHash(workspacePath, content);
}
