/**
 * Standalone entry point — activates CareAgent without a host platform.
 *
 * Use this when running CareAgent as a library or CLI tool outside of
 * OpenClaw or any other host platform plugin system.
 *
 * Phase 4 wires: Clinical Skills (SKIL-01 through SKIL-07).
 * Phase 5 wires: Refinement Engine (CANS-08 through CANS-10).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectPlatform } from '../adapters/detect.js';
import { createStandaloneAdapter } from '../adapters/standalone/index.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { ActivationGate, type ActivationResult } from '../activation/gate.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { createHardeningEngine } from '../hardening/engine.js';
import type { HardeningEngine } from '../hardening/types.js';
import { createCredentialValidator } from '../credentials/validator.js';
import { loadClinicalSkills } from '../skills/loader.js';
import { CHART_SKILL_ID, buildChartSkillInstructions } from '../skills/chart-skill/index.js';
import type { SkillLoadResult } from '../skills/types.js';
import { createRefinementEngine } from '../refinement/index.js';
import type { RefinementEngine } from '../refinement/refinement-engine.js';

export interface ActivateResult {
  adapter: PlatformAdapter;
  audit: AuditPipeline;
  activation: ActivationResult;
  engine?: HardeningEngine;
  skills?: SkillLoadResult[];
  refinement?: RefinementEngine;
}

/**
 * Activates CareAgent in standalone mode.
 *
 * Creates a standalone adapter, starts the audit pipeline, and checks
 * the activation gate. Returns all three so the caller can interact
 * with CareAgent programmatically.
 *
 * @param workspacePath - The workspace directory. Defaults to process.cwd().
 */
export function activate(workspacePath?: string): ActivateResult {
  // Step 0: Detect platform (PORT-02)
  const platform = detectPlatform(undefined);

  const adapter = createStandaloneAdapter(workspacePath);
  adapter.log('info', `[CareAgent] Platform detected: ${platform}`);
  const resolvedPath = adapter.getWorkspacePath();

  const audit = new AuditPipeline(resolvedPath);

  const gate = new ActivationGate(resolvedPath, (entry) => audit.log({
    action: entry.action as string,
    actor: 'system',
    outcome: (entry.outcome as 'error') || 'error',
    details: entry.details as Record<string, unknown> | undefined,
  }));

  const activation = gate.check();

  if (activation.active) {
    audit.log({
      action: 'activation_check',
      actor: 'system',
      outcome: 'active',
      details: {
        provider: activation.document!.provider.name,
        specialty: activation.document!.provider.specialty,
      },
    });

    // Activate hardening engine (hooks will no-op in standalone, but layers 1-4 still work)
    const engine = createHardeningEngine();
    engine.activate({ cans: activation.document!, adapter, audit });

    // Load clinical skills (non-fatal in standalone mode)
    let skills: SkillLoadResult[] = [];
    try {
      const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
      const skillsDir = join(pluginRoot, 'skills');
      const validator = createCredentialValidator();
      skills = loadClinicalSkills(skillsDir, activation.document!, validator, audit);

      // SKIL-05, SKIL-06: Inject chart-skill instructions if loaded
      const loadedSkills = skills.filter(s => s.loaded);
      const chartSkillLoaded = loadedSkills.some(s => s.skillId === CHART_SKILL_ID);
      if (chartSkillLoaded) {
        const instructions = buildChartSkillInstructions(activation.document!.voice);
        adapter.onAgentBootstrap((context) => {
          context.addFile('CHART_SKILL_INSTRUCTIONS', instructions);
        });
      }

      // ONBD-04: Persist skill results for status command
      try {
        const cacheDir = join(resolvedPath, '.careagent');
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(
          join(cacheDir, 'skill-load-results.json'),
          JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              results: skills.map(r => ({
                skillId: r.skillId,
                loaded: r.loaded,
                version: r.version,
                reason: r.reason,
              })),
            },
            null,
            2,
          ),
          'utf-8',
        );
      } catch {
        // Non-fatal: status will show "Not loaded in this session"
      }
    } catch {
      // Skills loading is non-fatal in standalone mode
    }

    // Create refinement engine (CANS-08, CANS-09, CANS-10)
    const refinement = createRefinementEngine({
      workspacePath: resolvedPath,
      audit,
      sessionId: audit.getSessionId(),
    });

    // CANS-08: Feed session-start observation via bootstrap handler
    adapter.onAgentBootstrap((_context) => {
      refinement.observe({
        category: 'skill_usage',
        field_path: 'skills.chart',
        declared_value: 'chart-skill',
        observed_value: 'session_start',
      });
    });

    return { adapter, audit, activation, engine, skills, refinement };
  } else {
    audit.log({
      action: 'activation_check',
      actor: 'system',
      outcome: 'inactive',
      details: { reason: activation.reason || 'No valid CANS.md' },
    });
  }

  return { adapter, audit, activation };
}
