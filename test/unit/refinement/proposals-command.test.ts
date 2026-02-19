import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runProposalsCommand } from '../../../src/cli/proposals-command.js';
import type { RefinementEngine } from '../../../src/refinement/refinement-engine.js';
import type { Proposal } from '../../../src/refinement/types.js';
import type { InterviewIO } from '../../../src/cli/io.js';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function makeProposal(overrides?: Partial<Proposal>): Proposal {
  return {
    id: 'proposal-001',
    created_at: '2026-02-19T00:00:00Z',
    field_path: 'clinical_voice.tone',
    category: 'voice',
    current_value: 'formal',
    proposed_value: 'conversational',
    evidence_summary: '6 of your last 8 voice events showed "conversational" instead of "formal"',
    observation_count: 6,
    status: 'pending',
    rejection_count: 0,
    ...overrides,
  };
}

function createMockEngine(proposals: Proposal[]): RefinementEngine & { resolveCalls: Array<{ id: string; action: string }> } {
  const resolveCalls: Array<{ id: string; action: string }> = [];
  return {
    observe: vi.fn(),
    generateProposals: vi.fn().mockReturnValue([]),
    getPendingProposals: vi.fn().mockReturnValue(proposals),
    resolveProposal: vi.fn((id, action) => {
      resolveCalls.push({ id, action });
    }),
    getProposalById: vi.fn(),
    resolveCalls,
  };
}

function createMockIO(responses: string[]): InterviewIO & { getOutput(): string[] } {
  let idx = 0;
  const output: string[] = [];

  return {
    async question(): Promise<string> {
      return responses[idx++] || '';
    },
    async select(_prompt: string, options: string[]): Promise<number> {
      const answer = parseInt(responses[idx++] || '0', 10);
      return Math.min(answer, options.length - 1);
    },
    async confirm(): Promise<boolean> {
      return (responses[idx++] || 'n').toLowerCase().startsWith('y');
    },
    display(text: string): void {
      output.push(text);
    },
    close(): void { /* no-op */ },
    getOutput(): string[] {
      return output;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runProposalsCommand', () => {
  it('outputs "No pending" when there are no proposals', async () => {
    const engine = createMockEngine([]);
    const io = createMockIO([]);

    await runProposalsCommand(engine, io);

    const output = io.getOutput();
    expect(output.some((line) => line.includes('No pending CANS.md refinement proposals'))).toBe(true);
  });

  it('shows batch summary with all proposals', async () => {
    const proposals = [
      makeProposal({ id: 'p1', field_path: 'clinical_voice.tone' }),
      makeProposal({ id: 'p2', field_path: 'clinical_voice.abbreviations', evidence_summary: 'Changed abbreviations' }),
    ];
    const engine = createMockEngine(proposals);
    const io = createMockIO(['s', 's']); // Skip both

    await runProposalsCommand(engine, io);

    const output = io.getOutput().join('\n');
    expect(output).toContain('CANS.md Refinement Proposals (2 pending)');
    expect(output).toContain('clinical_voice.tone');
    expect(output).toContain('clinical_voice.abbreviations');
  });

  it('accept action calls resolveProposal with accept', async () => {
    const proposals = [makeProposal({ id: 'p1' })];
    const engine = createMockEngine(proposals);
    const io = createMockIO(['a']);

    await runProposalsCommand(engine, io);

    expect(engine.resolveCalls).toHaveLength(1);
    expect(engine.resolveCalls[0]).toEqual({ id: 'p1', action: 'accept' });

    const output = io.getOutput().join('\n');
    expect(output).toContain('Proposal accepted: clinical_voice.tone');
  });

  it('reject action calls resolveProposal with reject', async () => {
    const proposals = [makeProposal({ id: 'p1' })];
    const engine = createMockEngine(proposals);
    const io = createMockIO(['r']);

    await runProposalsCommand(engine, io);

    expect(engine.resolveCalls).toHaveLength(1);
    expect(engine.resolveCalls[0]).toEqual({ id: 'p1', action: 'reject' });

    const output = io.getOutput().join('\n');
    expect(output).toContain('Proposal rejected: clinical_voice.tone');
  });

  it('defer action calls resolveProposal with defer', async () => {
    const proposals = [makeProposal({ id: 'p1' })];
    const engine = createMockEngine(proposals);
    const io = createMockIO(['d']);

    await runProposalsCommand(engine, io);

    expect(engine.resolveCalls).toHaveLength(1);
    expect(engine.resolveCalls[0]).toEqual({ id: 'p1', action: 'defer' });

    const output = io.getOutput().join('\n');
    expect(output).toContain('Proposal deferred: clinical_voice.tone');
  });

  it('skip action does not call resolveProposal', async () => {
    const proposals = [makeProposal({ id: 'p1' })];
    const engine = createMockEngine(proposals);
    const io = createMockIO(['s']);

    await runProposalsCommand(engine, io);

    expect(engine.resolveCalls).toHaveLength(0);
  });

  it('summary counts are correct after review', async () => {
    const proposals = [
      makeProposal({ id: 'p1', field_path: 'clinical_voice.tone' }),
      makeProposal({ id: 'p2', field_path: 'clinical_voice.abbreviations' }),
      makeProposal({ id: 'p3', field_path: 'clinical_voice.eponyms' }),
      makeProposal({ id: 'p4', field_path: 'clinical_voice.documentation_style' }),
    ];
    const engine = createMockEngine(proposals);
    // Accept p1, reject p2, defer p3, skip p4
    const io = createMockIO(['accept', 'reject', 'defer', 'skip']);

    await runProposalsCommand(engine, io);

    const output = io.getOutput().join('\n');
    expect(output).toContain('Reviewed 4 proposal(s): 1 accepted, 1 rejected, 1 deferred, 1 skipped');
  });

  it('accepts full-word inputs case-insensitively', async () => {
    const proposals = [makeProposal({ id: 'p1' })];
    const engine = createMockEngine(proposals);
    const io = createMockIO(['Accept']);

    await runProposalsCommand(engine, io);

    expect(engine.resolveCalls).toHaveLength(1);
    expect(engine.resolveCalls[0]).toEqual({ id: 'p1', action: 'accept' });
  });
});
