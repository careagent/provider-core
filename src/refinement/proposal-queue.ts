/**
 * ProposalQueue — proposal lifecycle management with JSON persistence.
 *
 * Stores proposals in `.careagent/proposals.json` as a single JSON file.
 * Unlike the observation store (append-only JSONL), proposals require
 * random access and in-place updates for status transitions.
 *
 * Zero external dependencies — uses only node:fs and node:path.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Proposal, ProposalResolution } from './types.js';

interface ProposalStore {
  proposals: Proposal[];
  last_updated: string;
}

export class ProposalQueue {
  private readonly queuePath: string;
  private store: ProposalStore;

  constructor(workspacePath: string) {
    this.queuePath = join(workspacePath, '.careagent', 'proposals.json');
    this.store = { proposals: [], last_updated: new Date().toISOString() };
    this.load();
  }

  /**
   * Load proposals from disk. Initializes empty store if file does not exist.
   */
  load(): void {
    if (existsSync(this.queuePath)) {
      const content = readFileSync(this.queuePath, 'utf-8');
      this.store = JSON.parse(content) as ProposalStore;
    } else {
      this.store = { proposals: [], last_updated: new Date().toISOString() };
    }
  }

  /**
   * Persist proposals to disk. Creates `.careagent/` directory if needed.
   */
  save(): void {
    mkdirSync(dirname(this.queuePath), { recursive: true });
    this.store.last_updated = new Date().toISOString();
    writeFileSync(this.queuePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  /**
   * Add a proposal to the queue and persist.
   */
  add(proposal: Proposal): void {
    this.store.proposals.push(proposal);
    this.save();
  }

  /**
   * Get all proposals matching a given status.
   */
  getByStatus(status: Proposal['status']): Proposal[] {
    return this.store.proposals.filter((p) => p.status === status);
  }

  /**
   * Get all pending and deferred proposals (actionable by the provider).
   */
  getPending(): Proposal[] {
    return this.store.proposals.filter(
      (p) => p.status === 'pending' || p.status === 'deferred',
    );
  }

  /**
   * Resolve a proposal: accept, reject, or defer.
   *
   * - Sets status to the resolution value
   * - Sets resolved_at to current ISO timestamp
   * - If rejected, increments rejection_count
   * - Persists to disk
   *
   * @throws Error if proposal not found
   */
  resolve(proposalId: string, resolution: ProposalResolution): Proposal {
    const proposal = this.store.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    proposal.status = resolution === 'accept' ? 'accepted'
      : resolution === 'reject' ? 'rejected'
      : 'deferred';

    proposal.resolved_at = new Date().toISOString();

    if (resolution === 'reject') {
      proposal.rejection_count = (proposal.rejection_count ?? 0) + 1;
    }

    this.save();
    return proposal;
  }

  /**
   * Find a proposal by ID.
   */
  getById(id: string): Proposal | undefined {
    return this.store.proposals.find((p) => p.id === id);
  }
}
