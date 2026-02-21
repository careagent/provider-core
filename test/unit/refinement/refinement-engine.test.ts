import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRefinementEngine } from '../../../src/refinement/refinement-engine.js';
import type { RefinementEngine } from '../../../src/refinement/refinement-engine.js';
import { ProposalQueue } from '../../../src/refinement/proposal-queue.js';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';
import { stringifyYAML } from '../../../src/vendor/yaml/index.js';
import { parseFrontmatter } from '../../../src/activation/cans-parser.js';
import { computeHash } from '../../../src/activation/cans-integrity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHILOSOPHY_BODY = 'I believe in evidence-based, patient-centered care.';

function createCANSFile(workspacePath: string, data?: Record<string, unknown>): void {
  const cansData = data ?? { ...validCANSData };
  const yaml = stringifyYAML(cansData);
  const content = `---\n${yaml}---\n\n${PHILOSOPHY_BODY}`;
  writeFileSync(join(workspacePath, 'CANS.md'), content, 'utf-8');
}

function readAuditLog(workspacePath: string): Array<Record<string, unknown>> {
  const logPath = join(workspacePath, '.careagent', 'AUDIT.log');
  const content = readFileSync(logPath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function seedObservations(
  engine: RefinementEngine,
  fieldPath: string,
  category: 'voice' | 'autonomy' | 'credential' | 'skill_usage' | 'identity',
  declaredValue: unknown,
  observedValue: unknown,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    engine.observe({
      category,
      field_path: fieldPath,
      declared_value: declaredValue,
      observed_value: observedValue,
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RefinementEngine', () => {
  let workspacePath: string;
  let audit: AuditPipeline;
  let engine: RefinementEngine;

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'careagent-engine-test-'));
    createCANSFile(workspacePath);
    audit = new AuditPipeline(workspacePath);
    engine = createRefinementEngine({
      workspacePath,
      audit,
      sessionId: 'test-session-001',
    });
  });

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // observe()
  // -------------------------------------------------------------------------

  it('observe() appends to observation store with auto-generated timestamp and sessionId', () => {
    engine.observe({
      category: 'voice',
      field_path: 'voice.chart',
      declared_value: 'formal',
      observed_value: 'conversational',
    });

    // Read observations file directly
    const obsPath = join(workspacePath, '.careagent', 'observations.jsonl');
    const content = readFileSync(obsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(1);

    const obs = JSON.parse(lines[0]);
    expect(obs.timestamp).toBeDefined();
    expect(obs.session_id).toBe('test-session-001');
    expect(obs.category).toBe('voice');
    expect(obs.field_path).toBe('voice.chart');
    expect(obs.declared_value).toBe('formal');
    expect(obs.observed_value).toBe('conversational');
  });

  // -------------------------------------------------------------------------
  // generateProposals()
  // -------------------------------------------------------------------------

  it('generateProposals() detects divergences and creates proposals in the queue', () => {
    seedObservations(engine, 'voice.chart', 'voice', 'formal', 'conversational', 6);

    const proposals = engine.generateProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].field_path).toBe('voice.chart');
    expect(proposals[0].current_value).toBe('formal');
    expect(proposals[0].proposed_value).toBe('conversational');
    expect(proposals[0].status).toBe('pending');

    // Verify they are in the queue
    const pending = engine.getPendingProposals();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(proposals[0].id);
  });

  it('generateProposals() audit-logs each new proposal with cans_proposal_created', () => {
    seedObservations(engine, 'voice.chart', 'voice', 'formal', 'conversational', 6);

    const proposals = engine.generateProposals();

    const entries = readAuditLog(workspacePath);
    const createdEntries = entries.filter(
      (e) => e.action === 'cans_proposal_created',
    );
    expect(createdEntries).toHaveLength(1);

    const details = createdEntries[0].details as Record<string, unknown>;
    expect(details.proposal_id).toBe(proposals[0].id);
    expect(details.field_path).toBe('voice.chart');
    expect(details.category).toBe('voice');
    expect(details.observation_count).toBe(6);
    expect(details.evidence_summary).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // resolveProposal() — accept
  // -------------------------------------------------------------------------

  it('resolveProposal(accept) writes to CANS.md, updates hash, audit-logs cans_proposal_accepted', () => {
    // Seed with voice data so the proposal is valid
    const cansWithVoice = {
      ...validCANSData,
      voice: { chart: 'formal', order: 'structured', educate: 'standard' },
    };
    createCANSFile(workspacePath, cansWithVoice);
    // Re-create engine so it picks up the new file
    engine = createRefinementEngine({ workspacePath, audit, sessionId: 'test-session-001' });

    seedObservations(engine, 'voice.chart', 'voice', 'formal', 'conversational', 6);
    const proposals = engine.generateProposals();
    const proposalId = proposals[0].id;

    engine.resolveProposal(proposalId, 'accept');

    // Verify CANS.md was updated
    const cansContent = readFileSync(join(workspacePath, 'CANS.md'), 'utf-8');
    const parsed = parseFrontmatter(cansContent);
    expect(parsed.frontmatter).not.toBeNull();
    const voice = parsed.frontmatter!.voice as Record<string, unknown>;
    expect(voice.chart).toBe('conversational');

    // Verify integrity hash was updated
    const integrityPath = join(workspacePath, '.careagent', 'cans-integrity.json');
    const integrity = JSON.parse(readFileSync(integrityPath, 'utf-8'));
    expect(integrity.hash).toBe(computeHash(cansContent));

    // Verify audit log
    const entries = readAuditLog(workspacePath);
    const accepted = entries.filter((e) => e.action === 'cans_proposal_accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0].actor).toBe('provider');
    expect((accepted[0].details as Record<string, unknown>).proposal_id).toBe(proposalId);
  });

  // -------------------------------------------------------------------------
  // resolveProposal() — reject
  // -------------------------------------------------------------------------

  it('resolveProposal(reject) updates proposal status, audit-logs cans_proposal_rejected', () => {
    seedObservations(engine, 'voice.chart', 'voice', 'formal', 'conversational', 6);
    const proposals = engine.generateProposals();
    const proposalId = proposals[0].id;

    engine.resolveProposal(proposalId, 'reject');

    // Verify proposal status
    const proposal = engine.getProposalById(proposalId);
    expect(proposal!.status).toBe('rejected');

    // Verify audit log
    const entries = readAuditLog(workspacePath);
    const rejected = entries.filter((e) => e.action === 'cans_proposal_rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].actor).toBe('provider');
    expect(rejected[0].action_state).toBe('provider-rejected');
  });

  // -------------------------------------------------------------------------
  // resolveProposal() — defer
  // -------------------------------------------------------------------------

  it('resolveProposal(defer) updates proposal status, audit-logs cans_proposal_deferred', () => {
    seedObservations(engine, 'voice.chart', 'voice', 'formal', 'conversational', 6);
    const proposals = engine.generateProposals();
    const proposalId = proposals[0].id;

    engine.resolveProposal(proposalId, 'defer');

    // Verify proposal status
    const proposal = engine.getProposalById(proposalId);
    expect(proposal!.status).toBe('deferred');

    // Verify audit log
    const entries = readAuditLog(workspacePath);
    const deferred = entries.filter((e) => e.action === 'cans_proposal_deferred');
    expect(deferred).toHaveLength(1);
    expect(deferred[0].actor).toBe('provider');
    expect(deferred[0].action_state).toBe('provider-modified');
  });

  // -------------------------------------------------------------------------
  // applyProposal — scope protection (defense layer 3)
  // -------------------------------------------------------------------------

  it('applyProposal rejects scope field changes (defense layer 3)', () => {
    // We need to bypass the pattern matcher and proposal generator to test
    // the engine's own scope check. We'll manually add a scope proposal
    // to the queue and try to accept it.
    const queue = new ProposalQueue(workspacePath);
    const fakeProposal = {
      id: 'fake-scope-proposal',
      created_at: new Date().toISOString(),
      field_path: 'scope.permitted_actions',
      category: 'identity' as const,
      current_value: ['chart_operative_note'],
      proposed_value: ['chart_operative_note', 'prescribe_anything'],
      evidence_summary: 'Attempted scope modification',
      observation_count: 10,
      status: 'pending' as const,
      rejection_count: 0,
    };
    queue.add(fakeProposal);

    // Create a fresh engine that will see the manually-added proposal
    const freshEngine = createRefinementEngine({ workspacePath, audit, sessionId: 'test-session-001' });

    expect(() => {
      freshEngine.resolveProposal('fake-scope-proposal', 'accept');
    }).toThrow('SAFETY VIOLATION: Cannot modify scope fields');
  });

  // -------------------------------------------------------------------------
  // applyProposal — schema validation
  // -------------------------------------------------------------------------

  it('applyProposal validates against CANSSchema before writing', () => {
    // Add a proposal that would create an invalid field value
    const queue = new ProposalQueue(workspacePath);
    const invalidProposal = {
      id: 'invalid-proposal',
      created_at: new Date().toISOString(),
      field_path: 'provider.name',
      category: 'identity' as const,
      current_value: 'Dr. Test Provider',
      proposed_value: '', // Empty string violates minLength: 1
      evidence_summary: 'Attempted invalid name change',
      observation_count: 10,
      status: 'pending' as const,
      rejection_count: 0,
    };
    queue.add(invalidProposal);

    const freshEngine = createRefinementEngine({ workspacePath, audit, sessionId: 'test-session-001' });

    expect(() => {
      freshEngine.resolveProposal('invalid-proposal', 'accept');
    }).toThrow('CANS.md validation failed');
  });

  // -------------------------------------------------------------------------
  // getPendingProposals()
  // -------------------------------------------------------------------------

  it('getPendingProposals returns pending and deferred proposals', () => {
    // Seed enough observations for two different field paths
    seedObservations(engine, 'voice.chart', 'voice', 'formal', 'conversational', 6);
    seedObservations(engine, 'voice.order', 'voice', 'standard', 'minimal', 6);

    const proposals = engine.generateProposals();
    expect(proposals).toHaveLength(2);

    // Defer one
    engine.resolveProposal(proposals[0].id, 'defer');

    // Both should still appear in pending (pending + deferred)
    const pending = engine.getPendingProposals();
    expect(pending).toHaveLength(2);

    const statuses = pending.map((p) => p.status);
    expect(statuses).toContain('pending');
    expect(statuses).toContain('deferred');
  });
});
