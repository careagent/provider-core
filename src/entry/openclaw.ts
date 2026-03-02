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

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { detectPlatform } from '../adapters/detect.js';
import { createAdapter } from '../adapters/openclaw/index.js';
import { getWorkspaceProfile } from '../onboarding/workspace-profiles.js';
import { ActivationGate } from '../activation/gate.js';
import { AuditPipeline } from '../audit/pipeline.js';
import { createAuditIntegrityService } from '../audit/integrity-service.js';
import { registerCLI } from '../cli/commands.js';
import { runClinicalActivation } from '../cli/activate-command.js';
import { generateDefaultAgentInstructions } from '../onboarding/default-agent-content.js';
import { generateOnboardingBootstrap, generateCansSchemaReference } from '../onboarding/onboarding-bootstrap.js';
import { createCansIntegrityService } from '../activation/integrity-service.js';
import { createHardeningEngine } from '../hardening/engine.js';
import { createCredentialValidator } from '../credentials/validator.js';
import { loadClinicalSkills } from '../skills/loader.js';
import { CHART_SKILL_ID, buildChartSkillInstructions } from '../skills/chart-skill/index.js';
import { createRefinementEngine } from '../refinement/index.js';
import {
  getConfigPath,
  ensureAgentInConfig,
  addPeerBinding,
  removePeerBinding,
  clearAgentSessions,
} from '../activation/config-manager.js';
import type { SlashCommandContext } from '../adapters/types.js';

export default function register(api: unknown): void {
  // Step 0: Detect platform (PORT-02) and resolve workspace profile (PORT-03)
  const platform = detectPlatform(api);
  const profile = getWorkspaceProfile(platform);

  // Step 1: Create adapter
  const adapter = createAdapter(api);
  adapter.log('info', `[CareAgent] Platform detected: ${platform}`);
  const workspacePath = adapter.getWorkspacePath();

  // Step 1.5: Pre-create careagent-provider agent in openclaw.json (filesystem, no CLI)
  const CAREAGENT_ID = 'careagent-provider';
  const configPath = getConfigPath();
  const clinicalWorkspacePath = resolve(workspacePath, '..', 'workspace-clinical');

  try {
    // Ensure workspace directory exists
    if (!existsSync(clinicalWorkspacePath)) {
      mkdirSync(clinicalWorkspacePath, { recursive: true });
    }

    // Write baseline workspace files (onboarding-ready SOUL.md + IDENTITY.md)
    writeFileSync(join(clinicalWorkspacePath, 'SOUL.md'), `# CareAgent — Onboarding Mode

You are CareAgent, a clinical AI assistant conducting a provider onboarding interview.

## Your Mission

BOOTSTRAP.md contains your complete interview script. Follow it EXACTLY as written.
Do not rephrase the questions. Do not reorder them. Do not add your own questions.
Do not list options unless BOOTSTRAP.md tells you to. Present each stage's questions
exactly as BOOTSTRAP.md specifies them.

## Critical Rules

- The HIPAA & Synthetic Data warning has already been displayed to the provider.
- Their first message is their consent response. Process it per BOOTSTRAP.md Stage 1.
- Present each stage exactly as written in BOOTSTRAP.md. One stage at a time.
- Do NOT break a stage into sub-questions unless BOOTSTRAP.md says to.
- Do NOT dump long lists of options. If BOOTSTRAP.md lists options for YOUR reference, summarize or ask the provider to state their answer — don't copy-paste the full list.
- Be warm, professional, and brief. Follow the script.
- When finished, write CANS.md in the exact format specified in BOOTSTRAP.md.
`, 'utf-8');

    writeFileSync(join(clinicalWorkspacePath, 'IDENTITY.md'), `# CareAgent Identity

- **Name:** CareAgent
- **Creature:** Clinical AI Assistant
- **Vibe:** Professional, warm, thorough
- **Emoji:** ⚕️
`, 'utf-8');

    // Add agent to openclaw.json if not already present
    const added = ensureAgentInConfig(configPath, CAREAGENT_ID, clinicalWorkspacePath);
    if (added) {
      adapter.log('info', `[CareAgent] Pre-created ${CAREAGENT_ID} agent in openclaw.json`);
    } else {
      adapter.log('info', `[CareAgent] ${CAREAGENT_ID} agent already exists in openclaw.json`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    adapter.log('warn', `[CareAgent] Failed to pre-create agent: ${msg}`);
  }

  // Step 2: Start audit pipeline (always active, even without CANS.md)
  const audit = new AuditPipeline(workspacePath);

  // Step 3: Register CLI commands (always available — needed before CANS.md exists)
  registerCLI(adapter, workspacePath, audit, profile);

  // Step 3.5: Register slash commands (auto-reply, no LLM involvement)
  // Telegram bot commands: lowercase letters, digits, underscores only.
  // Handlers return { text } so OpenClaw sends the reply back to the user on Telegram.
  adapter.registerSlashCommand({
    name: 'careagent_on',
    description: 'Switch to CareAgent clinical mode',
    handler: async (ctx: SlashCommandContext) => {
      const peerId = ctx.senderId;
      if (!peerId) {
        adapter.log('warn', '[CareAgent] /careagent_on: could not identify sender');
        return { text: 'Could not identify sender. Please try again.', isError: true };
      }

      const cansPath = join(clinicalWorkspacePath, 'CANS.md');
      const bootstrapPath = join(clinicalWorkspacePath, 'BOOTSTRAP.md');

      // --- Clinical path: CANS.md exists ---
      if (existsSync(cansPath)) {
        try {
          const result = await runClinicalActivation(
            workspacePath, clinicalWorkspacePath, audit, peerId, profile,
          );
          if (!result.success) {
            adapter.log('error', `[CareAgent] Clinical activation failed: ${result.error}`);
            return { text: `Activation failed: ${result.error}`, isError: true };
          }

          // Add peer-level binding
          addPeerBinding(configPath, CAREAGENT_ID, 'telegram', peerId);

          return { text: result.messages.join('\n') };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          adapter.log('error', `[CareAgent] Clinical activation error: ${msg}`);
          return { text: `Activation error: ${msg}`, isError: true };
        }
      }

      // --- Already in onboarding: BOOTSTRAP.md exists but no CANS.md ---
      if (existsSync(bootstrapPath)) {
        return {
          text: [
            'Onboarding is already in progress.',
            'Complete the interview with the CareAgent, then send /careagent_on again.',
          ].join('\n'),
        };
      }

      // --- Onboarding path: no CANS.md, no BOOTSTRAP.md ---
      try {
        // Write BOOTSTRAP.md
        const axonUrl = process.env['AXON_URL'];
        const bootstrapContent = generateOnboardingBootstrap(axonUrl ? { axonUrl } : undefined);
        writeFileSync(bootstrapPath, bootstrapContent, 'utf-8');

        // Write CANS-SCHEMA.md
        const schemaContent = generateCansSchemaReference();
        writeFileSync(join(clinicalWorkspacePath, 'CANS-SCHEMA.md'), schemaContent, 'utf-8');

        // Overwrite OpenClaw scaffolded files that compete with BOOTSTRAP.md
        // These generic instructions ("figure out who you are", "learn about
        // the human") dilute the carefully designed interview flow.
        writeFileSync(join(clinicalWorkspacePath, 'AGENTS.md'), `# CareAgent Onboarding Agent

You are conducting an onboarding interview. Your ONLY job right now is to follow BOOTSTRAP.md exactly.

Do not improvise. Do not add questions. Do not skip stages. Follow BOOTSTRAP.md word for word.
`, 'utf-8');
        writeFileSync(join(clinicalWorkspacePath, 'USER.md'), `# Provider

The provider is being onboarded. You will learn about them during the interview.
`, 'utf-8');
        // Remove TOOLS.md and HEARTBEAT.md — not relevant during onboarding
        for (const f of ['TOOLS.md', 'HEARTBEAT.md']) {
          const p = join(clinicalWorkspacePath, f);
          if (existsSync(p)) {
            try { unlinkSync(p); } catch { /* ignore */ }
          }
        }

        // Add peer-level binding to route this user to careagent-provider
        addPeerBinding(configPath, CAREAGENT_ID, 'telegram', peerId);

        // Clear sessions so agent reads fresh workspace files
        clearAgentSessions(CAREAGENT_ID);

        audit.log({
          action: 'careagent_activate',
          actor: 'provider',
          outcome: 'active',
          details: {
            step: 'onboarding_started',
            peerId,
            agent_id: CAREAGENT_ID,
            clinical_workspace: clinicalWorkspacePath,
          },
        });

        adapter.log('info', `[CareAgent] Onboarding started for peer ${peerId}`);

        return {
          text: [
            '⚕️ *HIPAA & Synthetic Data Disclosure*',
            '',
            'CareAgent operates on *synthetic data only*. Never input real patient information.',
            'All interactions are logged to an append-only, hash-chained audit trail.',
            'By proceeding, you acknowledge these terms.',
            '',
            'Please confirm each of the following by answering "Yes":',
            '1. HIPAA warning acknowledged',
            '2. Synthetic data only — no real patient data will be processed',
            '3. Consent to audit logging',
          ].join('\n'),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        adapter.log('error', `[CareAgent] Onboarding failed: ${msg}`);
        return { text: `Activation failed: ${msg}`, isError: true };
      }
    },
  });

  adapter.registerSlashCommand({
    name: 'careagent_off',
    description: 'Return to personal agent mode',
    handler: async (ctx: SlashCommandContext) => {
      const peerId = ctx.senderId;

      // Remove peer-level binding
      if (peerId) {
        try {
          removePeerBinding(configPath, CAREAGENT_ID, peerId);
          adapter.log('info', `[CareAgent] Removed peer binding for ${peerId}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          adapter.log('warn', `[CareAgent] Failed to remove peer binding: ${msg}`);
        }
      }

      audit.log({
        action: 'careagent_deactivate',
        actor: 'provider',
        outcome: 'inactive',
        details: { step: 'complete', agent_id: CAREAGENT_ID, peerId },
      });

      return { text: 'CareAgent clinical mode deactivated. You are now in personal agent mode.' };
    },
  });

  // Step 3.7: Inject default agent instructions (tells default agent about /careagent_on)
  adapter.onAgentBootstrap((context) => {
    context.addFile('CAREAGENT_INFO', generateDefaultAgentInstructions());
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

    // SKIL-05, SKIL-06: Inject chart-skill instructions into agent context if loaded
    const chartSkillLoaded = loadedSkills.some(s => s.skillId === CHART_SKILL_ID);
    if (chartSkillLoaded) {
      const instructions = buildChartSkillInstructions(cans.voice);
      adapter.onAgentBootstrap((context) => {
        context.addFile('CHART_SKILL_INSTRUCTIONS', instructions);
      });
      adapter.log('info', '[CareAgent] Chart-skill instructions registered for agent bootstrap');
    }

    // ONBD-04: Persist skill results so careagent status can display loaded skills
    try {
      const cacheDir = join(workspacePath, '.careagent');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        join(cacheDir, 'skill-load-results.json'),
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            results: skillResults.map(r => ({
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
    } catch (cacheErr) {
      const msg = cacheErr instanceof Error ? cacheErr.message : String(cacheErr);
      adapter.log('warn', `[CareAgent] Failed to write skill cache: ${msg}`);
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

  // CANS-08: Feed session-start observation into refinement engine on agent bootstrap
  adapter.onAgentBootstrap((_context) => {
    refinement.observe({
      category: 'skill_usage',
      field_path: 'skills.chart',
      declared_value: 'chart-skill',
      observed_value: 'session_start',
    });
  });

  // Step 7: Register audit integrity background service (AUDT-06)
  const integrityService = createAuditIntegrityService(audit, adapter);
  adapter.registerBackgroundService(integrityService);

  // Step 8: Register CANS.md integrity background service
  const cansIntegrityService = createCansIntegrityService(workspacePath, audit, adapter);
  adapter.registerBackgroundService(cansIntegrityService);
}
