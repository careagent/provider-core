/**
 * OpenClaw entry point — plugin registration for the OpenClaw platform.
 *
 * OpenClaw discovers this via the `openclaw.extensions` field in package.json
 * and calls the default export with the plugin API.
 *
 * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline.
 * Phase 3 wires: Hardening Engine (HARD-01 through HARD-07).
 * Later phases add: Skills.
 */

import { createAdapter } from '../adapters/openclaw/index.js';
import { ActivationGate } from '../activation/gate.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { createAuditIntegrityService } from '../audit/integrity-service.js';
import { registerCLI } from '../cli/commands.js';
import { createHardeningEngine } from '../hardening/engine.js';

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
      specialty: cans.provider.specialty,
      institution: cans.provider.institution,
      autonomy: cans.autonomy,
    },
  });
  adapter.log('info', `[CareAgent] Clinical mode ACTIVE for ${cans.provider.name} (${cans.provider.specialty})`);

  // Step 6: Activate hardening engine (HARD-01 through HARD-07)
  const engine = createHardeningEngine();
  engine.activate({ cans, adapter, audit });

  // Step 7: Register audit integrity background service (AUDT-06)
  const integrityService = createAuditIntegrityService(audit, adapter);
  adapter.registerBackgroundService(integrityService);
}
