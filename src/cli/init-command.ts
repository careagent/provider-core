/**
 * Init command orchestrator.
 * Wires together the onboarding interview, review loop, workspace supplementation,
 * and success summary for the `careagent init` CLI command.
 */

import type { InterviewIO } from './io.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import type { WorkspaceProfile } from '../onboarding/workspace-profiles.js';
import { runInterview } from '../onboarding/engine.js';
import { reviewLoop } from '../onboarding/review.js';
import { supplementWorkspaceFiles } from '../onboarding/workspace-writer.js';

export async function runInitCommand(
  io: InterviewIO,
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,
): Promise<void> {
  try {
    // Step 1: Run the interview
    const result = await runInterview(io);

    // Step 2: Review loop (handles generation, preview, editing, final write)
    // reviewLoop writes CANS.md and seeds integrity hash on approval
    await reviewLoop(io, result, workspacePath, audit);

    // Step 3: Supplement workspace files
    const supplemented = supplementWorkspaceFiles(workspacePath, result.data, result.philosophy, profile);

    // Step 4: Success summary
    io.display('\n--- Onboarding Complete ---');
    io.display(`CANS.md generated for ${result.data.provider.name}`);
    if (supplemented.length > 0) {
      io.display(`Workspace files supplemented: ${supplemented.join(', ')}`);
    } else {
      io.display('No workspace files supplemented (standalone mode).');
    }
    io.display('Run "careagent status" to verify activation.\n');
  } finally {
    io.close();
  }
}
