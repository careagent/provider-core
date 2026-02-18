/**
 * Review-edit-regenerate loop for CANS.md onboarding.
 * Allows the provider to review a preview, edit sections, and approve the final CANS.md.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InterviewIO } from '../cli/io.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import type { InterviewResult, InterviewState } from './engine.js';
import { InterviewStage, runSingleStage, runInterview } from './engine.js';
import { generateCANSContent, generatePreview } from './cans-generator.js';
import { updateKnownGoodHash } from '../activation/cans-integrity.js';
import type { CANSDocument, Hardening } from '../activation/cans-schema.js';

// ---------------------------------------------------------------------------
// Stage-to-menu mapping
// ---------------------------------------------------------------------------

const MENU_TO_STAGE: Record<number, InterviewStage> = {
  1: InterviewStage.IDENTITY,
  2: InterviewStage.CREDENTIALS,
  3: InterviewStage.SPECIALTY,
  4: InterviewStage.SCOPE,
  5: InterviewStage.PHILOSOPHY,
  6: InterviewStage.VOICE,
  7: InterviewStage.AUTONOMY,
};

const REVIEW_MENU_OPTIONS = [
  'Approve and save',
  'Edit provider information (name, NPI)',
  'Edit credentials (license type, state, number)',
  'Edit specialty and institution',
  'Edit scope (permitted/prohibited actions)',
  'Edit clinical philosophy',
  'Edit clinical voice',
  'Edit autonomy tiers',
  'Toggle hardening flags',
  'Start over (full re-interview)',
];

// ---------------------------------------------------------------------------
// reviewLoop
// ---------------------------------------------------------------------------

export async function reviewLoop(
  io: InterviewIO,
  result: InterviewResult,
  workspacePath: string,
  audit: AuditPipeline,
): Promise<void> {
  // Mutable current state — starts from interview result
  let currentData: CANSDocument = result.data;
  let currentPhilosophy: string = result.philosophy;

  while (true) {
    // Step 1: Generate CANS.md content from current data
    const genResult = generateCANSContent(currentData, currentPhilosophy);

    // Step 2: If generation fails, display errors and continue loop
    if (!genResult.success) {
      io.display('');
      io.display('ERROR: CANS.md generation failed with the following errors:');
      for (const err of genResult.errors || []) {
        io.display(`  ${err.path}: ${err.message}`);
      }
      io.display('');
    }

    // Step 3: Display preview
    const preview = generatePreview(currentData, currentPhilosophy);
    io.display('');
    io.display(preview);

    // Step 4: Present review menu
    const choice = await io.select('Review options:', REVIEW_MENU_OPTIONS);

    // Step 5: Approve and save
    if (choice === 0) {
      // Generate final content
      const finalResult = generateCANSContent(currentData, currentPhilosophy);
      if (!finalResult.success || !finalResult.content) {
        io.display('Cannot save: CANS.md generation failed. Please fix errors first.');
        continue;
      }

      const content = finalResult.content;
      const cansPath = join(workspacePath, 'CANS.md');

      // Write to workspace
      writeFileSync(cansPath, content, 'utf-8');

      // Seed integrity hash
      updateKnownGoodHash(workspacePath, content);

      // Log audit event
      audit.log({
        action: 'cans_generated',
        actor: 'provider',
        outcome: 'allowed',
        details: {
          provider: currentData.provider.name,
          specialty: currentData.provider.specialty,
        },
      });

      io.display('');
      io.display('================================================================================');
      io.display('  CANS.md saved successfully.');
      io.display(`  Location: ${cansPath}`);
      io.display('================================================================================');
      io.display('');
      return;
    }

    // Step 6: Edit section (1-7)
    if (choice >= 1 && choice <= 7) {
      const stage = MENU_TO_STAGE[choice];

      // Build InterviewState from current result
      const state: InterviewState = {
        stage,
        data: { ...currentData },
        philosophy: currentPhilosophy,
      };

      // Run the single stage
      const updatedState = await runSingleStage(stage, state, io);

      // Merge updated fields back
      currentData = updatedState.data as CANSDocument;
      currentPhilosophy = updatedState.philosophy;

      continue;
    }

    // Step 7: Toggle hardening flags (8)
    if (choice === 8) {
      await toggleHardeningLoop(io, currentData, (updated) => {
        currentData = { ...currentData, hardening: updated };
      });
      continue;
    }

    // Step 8: Start over (9)
    if (choice === 9) {
      io.display('');
      io.display('Starting full re-interview...');
      io.display('');
      const newResult = await runInterview(io);
      currentData = newResult.data;
      currentPhilosophy = newResult.philosophy;
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// toggleHardeningLoop — inner loop for flag toggling
// ---------------------------------------------------------------------------

async function toggleHardeningLoop(
  io: InterviewIO,
  currentData: CANSDocument,
  onUpdate: (updated: Hardening) => void,
): Promise<void> {
  let hardening: Hardening = { ...currentData.hardening };

  while (true) {
    const flagEntries = Object.entries(hardening) as Array<[keyof Hardening, boolean]>;

    io.display('');
    io.display('Hardening Flags (select to toggle):');

    const options = [
      ...flagEntries.map(([flag, value]) => `${flag}: ${value ? 'enabled' : 'disabled'}`),
      'Done',
    ];

    const idx = await io.select('Select a flag to toggle (or Done):', options);

    // Last option is "Done"
    if (idx === flagEntries.length) {
      onUpdate(hardening);
      return;
    }

    if (idx >= 0 && idx < flagEntries.length) {
      const [flag] = flagEntries[idx];
      hardening = { ...hardening, [flag]: !hardening[flag] };
      io.display(`Toggled ${flag}: now ${hardening[flag] ? 'enabled' : 'disabled'}`);
    }
  }
}
