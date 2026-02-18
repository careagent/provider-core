/**
 * @careagent/core — Clinical activation layer for OpenClaw
 *
 * This is the plugin entry point. OpenClaw discovers this via the
 * `openclaw.extensions` field in package.json and calls the default
 * export with the plugin API.
 *
 * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline.
 * Later phases add: Onboarding, Hardening, Skills, CLI.
 */

import { createAdapter } from './adapter/openclaw-adapter.js';
import { ActivationGate } from './activation/gate.js';
import { AuditPipeline } from './audit/pipeline.js';
import { createAuditIntegrityService } from './audit/integrity-service.js';

export default function register(api: unknown): void {
  // Step 1: Create adapter
  const adapter = createAdapter(api);
  const workspacePath = adapter.getWorkspacePath();

  // Step 2: Start audit pipeline (always active, even without CANS.md)
  const audit = new AuditPipeline(workspacePath);

  // Step 3: Register CLI commands (always available — needed before CANS.md exists)
  adapter.registerCliCommand({
    name: 'careagent',
    description: 'CareAgent clinical activation commands',
    handler: () => {
      console.log('[CareAgent] CLI not yet implemented. Coming in Phase 2.');
    },
  });

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

  // Step 6: Register before_tool_call canary
  let hookCanaryFired = false;
  adapter.onBeforeToolCall(() => {
    if (!hookCanaryFired) {
      hookCanaryFired = true;
      audit.log({
        action: 'hook_canary',
        actor: 'system',
        outcome: 'allowed',
        details: { hook: 'before_tool_call', status: 'verified' },
      });
    }
    return { block: false };
  });

  // Step 7: Register audit integrity background service (AUDT-06)
  const integrityService = createAuditIntegrityService(audit, adapter);
  adapter.registerBackgroundService(integrityService);

  // Step 8: Log canary status after delay
  setTimeout(() => {
    if (!hookCanaryFired) {
      adapter.log('warn', '[CareAgent] before_tool_call hook did NOT fire. Safety Guard will be degraded.');
      audit.log({
        action: 'hook_canary',
        actor: 'system',
        outcome: 'error',
        details: { hook: 'before_tool_call', status: 'not_fired', message: 'Safety Guard Layer 5 will be degraded in Phase 3' },
      });
    }
  }, 30_000);
}
