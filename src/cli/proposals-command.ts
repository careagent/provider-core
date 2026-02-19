/**
 * Proposals CLI command — batch review of CANS.md refinement proposals.
 *
 * Presents pending proposals to the provider with Accept/Reject/Defer/Skip
 * actions and invokes the refinement engine to apply resolutions.
 *
 * Covers:
 * - CANS-10: Provider review interface for refinement proposals
 */

import type { InterviewIO } from './io.js';
import type { RefinementEngine } from '../refinement/index.js';
import { generateDiffView } from '../refinement/index.js';
import type { ProposalResolution } from '../refinement/index.js';

/**
 * Run the `careagent proposals` CLI command.
 *
 * 1. Generates any new proposals from accumulated observations
 * 2. Presents all pending/deferred proposals to the provider
 * 3. Accepts provider action for each proposal
 * 4. Outputs summary of reviewed proposals
 */
export async function runProposalsCommand(
  engine: RefinementEngine,
  io: InterviewIO,
): Promise<void> {
  // Step 1: Detect any new proposals from accumulated observations
  engine.generateProposals();

  // Step 2: Get all reviewable proposals
  const proposals = engine.getPendingProposals();

  if (proposals.length === 0) {
    io.display('No pending CANS.md refinement proposals.');
    return;
  }

  // Step 3: Show batch summary
  const header = `CANS.md Refinement Proposals (${proposals.length} pending)`;
  const separator = '='.repeat(header.length);
  const summaryLines = proposals.map(
    (p, i) => `${i + 1}. [${p.status}] ${p.field_path}: ${p.evidence_summary}`,
  );

  io.display(`${header}\n${separator}\n${summaryLines.join('\n')}`);

  // Step 4: Present each proposal for review
  let accepted = 0;
  let rejected = 0;
  let deferred = 0;
  let skipped = 0;

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];

    // Show detail view
    const diffView = generateDiffView(proposal);
    io.display(
      `\nProposal ${i + 1}/${proposals.length}: ${proposal.field_path}\n---\n` +
      `${proposal.evidence_summary}\n\n${diffView}\n\n` +
      `Action: [A]ccept / [R]eject / [D]efer / [S]kip`,
    );

    // Read provider action
    const answer = await io.question('Action: ');
    const normalized = answer.toLowerCase().trim();

    let action: ProposalResolution | 'skip' = 'skip';
    if (normalized === 'a' || normalized === 'accept') {
      action = 'accept';
    } else if (normalized === 'r' || normalized === 'reject') {
      action = 'reject';
    } else if (normalized === 'd' || normalized === 'defer') {
      action = 'defer';
    } else {
      action = 'skip';
    }

    if (action === 'skip') {
      skipped++;
      continue;
    }

    // Resolve the proposal
    engine.resolveProposal(proposal.id, action);

    const pastTense = action === 'accept' ? 'accepted'
      : action === 'reject' ? 'rejected'
      : 'deferred';
    io.display(`Proposal ${pastTense}: ${proposal.field_path}`);

    if (action === 'accept') accepted++;
    else if (action === 'reject') rejected++;
    else deferred++;
  }

  // Step 5: Output summary
  io.display(
    `\nReviewed ${proposals.length} proposal(s): ` +
    `${accepted} accepted, ${rejected} rejected, ${deferred} deferred, ${skipped} skipped`,
  );
}
