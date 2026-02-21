/**
 * OpenClaw entry point — plugin registration for the OpenClaw platform.
 *
 * OpenClaw discovers this via the `openclaw.extensions` field in package.json
 * and calls the default export with the plugin API.
 *
 * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline.
 * Phase 3 wires: Hardening Engine (HARD-01 through HARD-07).
 * Phase 4 wires: Clinical Skills (SKIL-01 through SKIL-07).
 * Phase 5 wires: Refinement Engine (CANS-08 through CANS-10).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAdapter } from '../adapters/openclaw/index.js';
import { ActivationGate } from '../activation/gate.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { createAuditIntegrityService } from '../audit/integrity-service.js';
import { registerCLI } from '../cli/commands.js';
import { createHardeningEngine } from '../hardening/engine.js';
import { createCredentialValidator } from '../credentials/validator.js';
import { loadClinicalSkills } from '../skills/loader.js';
import { createRefinementEngine } from '../refinement/index.js';

export default function register(api: unknown): void {
  // Step 1: Create adapter
  const adapter = createAdapter(api);
  const workspacePath = adapter.getWorkspacePath();

  // Step 2: Start audit pipeline (always active, even without CANS.md)
  const audit = new AuditPipeline(workspacePath);

  // Step 3: Register CLI commands (always available — needed before CANS.md exists)
  registerCLI(adapter, workspacePath, audit);

  // Step 4: Check activation gate
  const gate = new ActivationGate(workspacePath, (entry) => audit.log({
    action: entry.action as string,
    actor: 'system',
    outcome: (entry.outcome as 'error') || 'error',
    details: entry.details as Record<string, unknown> | undefined,
  }));

  const result = gate.check();

  if (!result.active || !result.document) {
    audit.log({
      action: 'activation_check',
      actor: 'system',
      outcome: 'inactive',
      details: { reason: result.reason || 'No valid CANS.md' },
    });
    adapter.log('info', `[CareAgent] Clinical mode inactive: ${result.reason || 'No CANS.md found'}`);
    return;
  }

  // Step 5: Clinical mode active
  const cans = result.document;
  audit.log({
    action: 'activation_check',
    actor: 'system',
    outcome: 'active',
    details: {
      provider: cans.provider.name,
      specialty: cans.provider.specialty ?? 'none',
      organization: (cans.provider.organizations.find((o) => o.primary) ?? cans.provider.organizations[0])?.name,
      autonomy: cans.autonomy,
    },
  });
  adapter.log('info', `[CareAgent] Clinical mode ACTIVE for ${cans.provider.name} (${cans.provider.specialty ?? cans.provider.types.join('/')})`);

  // Step 6: Activate hardening engine (HARD-01 through HARD-07)
  const engine = createHardeningEngine();
  engine.activate({ cans, adapter, audit });

  // Step 6.5: Load clinical skills (SKIL-01 through SKIL-07)
  try {
    const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const skillsDir = join(pluginRoot, 'skills');
    const validator = createCredentialValidator();
    const skillResults = loadClinicalSkills(skillsDir, cans, validator, audit);

    const loadedSkills = skillResults.filter(r => r.loaded);
    const blockedSkills = skillResults.filter(r => !r.loaded);

    if (loadedSkills.length > 0) {
      adapter.log('info', `[CareAgent] Loaded ${loadedSkills.length} clinical skill(s): ${loadedSkills.map(s => s.skillId).join(', ')}`);
    }
    if (blockedSkills.length > 0) {
      adapter.log('warn', `[CareAgent] Blocked ${blockedSkills.length} clinical skill(s): ${blockedSkills.map(s => `${s.skillId} (${s.reason})`).join(', ')}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Skill loading failed: ${msg}`);
    audit.log({ action: 'skill_load', actor: 'system', outcome: 'error', details: { error: msg } });
  }

  // Step 6.7: Create refinement engine and register proposals command (CANS-08, CANS-09, CANS-10)
  const refinement = createRefinementEngine({
    workspacePath,
    audit,
    sessionId: audit.getSessionId(),
  });
  adapter.registerCliCommand({
    name: 'careagent proposals',
    description: 'Review and act on CANS.md refinement proposals',
    handler: async () => {
      const { createTerminalIO } = await import('../cli/io.js');
      const { runProposalsCommand } = await import('../cli/proposals-command.js');
      const io = createTerminalIO();
      await runProposalsCommand(refinement, io);
    },
  });

  // Step 7: Register audit integrity background service (AUDT-06)
  const integrityService = createAuditIntegrityService(audit, adapter);
  adapter.registerBackgroundService(integrityService);
}
