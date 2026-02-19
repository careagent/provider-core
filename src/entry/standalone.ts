/**
 * Standalone entry point — activates CareAgent without a host platform.
 *
 * Use this when running CareAgent as a library or CLI tool outside of
 * OpenClaw or any other host platform plugin system.
 *
 * Phase 4 wires: Clinical Skills (SKIL-01 through SKIL-07).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStandaloneAdapter } from '../adapters/standalone/index.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { ActivationGate, type ActivationResult } from '../activation/gate.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { createHardeningEngine } from '../hardening/engine.js';
import type { HardeningEngine } from '../hardening/types.js';
import { createCredentialValidator } from '../credentials/validator.js';
import { loadClinicalSkills } from '../skills/loader.js';
import type { SkillLoadResult } from '../skills/types.js';

export interface ActivateResult {
  adapter: PlatformAdapter;
  audit: AuditPipeline;
  activation: ActivationResult;
  engine?: HardeningEngine;
  skills?: SkillLoadResult[];
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
  const adapter = createStandaloneAdapter(workspacePath);
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
    } catch {
      // Skills loading is non-fatal in standalone mode
    }

    return { adapter, audit, activation, engine, skills };
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
