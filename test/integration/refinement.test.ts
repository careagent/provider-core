/**
 * Refinement engine end-to-end integration tests.
 *
 * Verifies the complete refinement lifecycle with real files:
 * - Full cycle: observe -> detect -> propose -> accept -> CANS.md updated
 * - Scope field observations never generate proposals
 * - Rejected proposal resurfaces at higher threshold
 * - Deferred proposal persists across engine instances
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AuditPipeline } from '../../src/audit/pipeline.js';
import { createRefinementEngine } from '../../src/refinement/refinement-engine.js';
import { verifyIntegrity } from '../../src/activation/cans-integrity.js';
import { parseFrontmatter } from '../../src/activation/cans-parser.js';
import {
  createTestWorkspace,
} from '../fixtures/synthetic-neurosurgeon.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAuditEntries(workspacePath: string): Array<Record<string, unknown>> {
  const auditPath = join(workspacePath, '.careagent', 'AUDIT.log');
  if (!existsSync(auditPath)) return [];
  const content = readFileSync(auditPath, 'utf-8');
  return content
    .trimEnd()
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Refinement Engine E2E Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-refinement-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full cycle: observe -> detect -> propose -> accept -> CANS.md updated', () => {
    createTestWorkspace(tmpDir);

    const audit = new AuditPipeline(tmpDir);
    const engine = createRefinementEngine({
      workspacePath: tmpDir,
      audit,
      sessionId: 'test-session',
    });

    // Record 6 observations of voice.chart divergence
    for (let i = 0; i < 6; i++) {
      engine.observe({
        category: 'voice',
        field_path: 'voice.chart',
        declared_value: 'formal, structured templates',
        observed_value: 'conversational',
      });
    }

    // Generate proposals -- should produce 1 proposal
    const proposals = engine.generateProposals();
    expect(proposals.length).toBe(1);

    const proposal = proposals[0];
    expect(proposal.field_path).toBe('voice.chart');
    expect(proposal.proposed_value).toBe('conversational');

    // Assert: AUDIT.log has cans_proposal_created entry
    let entries = readAuditEntries(tmpDir);
    const createdEntry = entries.find((e) => e.action === 'cans_proposal_created');
    expect(createdEntry).toBeDefined();
    expect((createdEntry!.details as Record<string, unknown>).proposal_id).toBe(proposal.id);

    // Accept the proposal
    engine.resolveProposal(proposal.id, 'accept');

    // Read CANS.md -- verify voice.chart is now 'conversational'
    const cansPath = join(tmpDir, 'CANS.md');
    const updatedContent = readFileSync(cansPath, 'utf-8');
    const parsed = parseFrontmatter(updatedContent);
    expect(parsed.frontmatter).toBeDefined();
    const voice = (parsed.frontmatter as Record<string, unknown>).voice as Record<string, unknown>;
    expect(voice.chart).toBe('conversational');

    // Verify integrity: hash was updated correctly
    const integrity = verifyIntegrity(tmpDir, updatedContent);
    expect(integrity.valid).toBe(true);

    // Assert: AUDIT.log has cans_proposal_accepted entry
    entries = readAuditEntries(tmpDir);
    const acceptedEntry = entries.find((e) => e.action === 'cans_proposal_accepted');
    expect(acceptedEntry).toBeDefined();
  });

  it('scope field observations never generate proposals', () => {
    createTestWorkspace(tmpDir);

    const audit = new AuditPipeline(tmpDir);
    const engine = createRefinementEngine({
      workspacePath: tmpDir,
      audit,
      sessionId: 'test-session',
    });

    // Record 12 observations with scope field_path
    for (let i = 0; i < 12; i++) {
      engine.observe({
        category: 'voice', // category doesn't matter; field_path does
        field_path: 'scope.permitted_actions',
        declared_value: ['chart_operative_note'],
        observed_value: ['chart_operative_note', 'prescribe_controlled_substances'],
      });
    }

    // Generate proposals -- should produce 0 proposals
    const proposals = engine.generateProposals();
    expect(proposals.length).toBe(0);
  });

  it('rejected proposal resurfaces at higher threshold', () => {
    createTestWorkspace(tmpDir);

    const audit = new AuditPipeline(tmpDir);
    const engine = createRefinementEngine({
      workspacePath: tmpDir,
      audit,
      sessionId: 'test-session',
    });

    // Record 5 voice observations, generate proposal, reject it
    for (let i = 0; i < 5; i++) {
      engine.observe({
        category: 'voice',
        field_path: 'voice.order',
        declared_value: 'concise',
        observed_value: 'narrative',
      });
    }

    const firstProposals = engine.generateProposals();
    expect(firstProposals.length).toBe(1);

    engine.resolveProposal(firstProposals[0].id, 'reject');

    // Record 5 more (total 10 divergent since rejection check looks at all)
    for (let i = 0; i < 5; i++) {
      engine.observe({
        category: 'voice',
        field_path: 'voice.order',
        declared_value: 'concise',
        observed_value: 'narrative',
      });
    }

    // May or may not resurface depending on resurfacing threshold
    const secondProposals = engine.generateProposals();

    // Record 5 more (total 15 divergent observations)
    for (let i = 0; i < 5; i++) {
      engine.observe({
        category: 'voice',
        field_path: 'voice.order',
        declared_value: 'concise',
        observed_value: 'narrative',
      });
    }

    const thirdProposals = engine.generateProposals();

    // By the third check we have 15 divergent observations,
    // which exceeds RESURFACE_THRESHOLD (10) and prior observation_count (5).
    // The resurfaced proposal should appear either in secondProposals or thirdProposals.
    const allResurfaced = [...secondProposals, ...thirdProposals];
    expect(allResurfaced.length).toBeGreaterThanOrEqual(1);

    const resurfacedProposal = allResurfaced.find(
      (p) => p.field_path === 'voice.order',
    );
    expect(resurfacedProposal).toBeDefined();
    expect(resurfacedProposal!.observation_count).toBeGreaterThan(5);
  });

  it('deferred proposal persists and remains visible', () => {
    createTestWorkspace(tmpDir);

    const audit = new AuditPipeline(tmpDir);
    const engine1 = createRefinementEngine({
      workspacePath: tmpDir,
      audit,
      sessionId: 'session-1',
    });

    // Record observations and generate proposal
    for (let i = 0; i < 6; i++) {
      engine1.observe({
        category: 'voice',
        field_path: 'voice.order',
        declared_value: 'concise',
        observed_value: 'minimal',
      });
    }

    const proposals = engine1.generateProposals();
    expect(proposals.length).toBe(1);

    // Defer the proposal
    engine1.resolveProposal(proposals[0].id, 'defer');

    // Verify deferred proposal is in pending list
    const pending1 = engine1.getPendingProposals();
    const deferred1 = pending1.find((p) => p.id === proposals[0].id);
    expect(deferred1).toBeDefined();
    expect(deferred1!.status).toBe('deferred');

    // Create a NEW refinement engine instance (simulating session restart)
    const engine2 = createRefinementEngine({
      workspacePath: tmpDir,
      audit,
      sessionId: 'session-2',
    });

    // Deferred proposal should still be visible (persisted)
    const pending2 = engine2.getPendingProposals();
    const deferred2 = pending2.find((p) => p.id === proposals[0].id);
    expect(deferred2).toBeDefined();
    expect(deferred2!.status).toBe('deferred');
  });
});
