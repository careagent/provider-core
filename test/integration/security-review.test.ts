/**
 * Security review integration tests (INTG-02).
 *
 * Validates all six hardening layers correctly block unauthorized actions
 * in realistic scenarios with the synthetic neurosurgeon persona.
 *
 * Layers tested:
 * - Layer 1: Tool Policy Lockdown (HARD-01)
 * - Layer 2: Exec Allowlist (HARD-02)
 * - Layer 3: CANS Protocol Injection (HARD-03)
 * - Layer 4: Docker Sandbox Detection (HARD-04)
 * - Layer 5: Safety Guard short-circuit (HARD-05)
 * - Layer 6: Audit Trail Integration (HARD-06)
 *
 * Adversarial scenarios:
 * - Scope boundary violation
 * - Audit log tampering detection
 * - Skill file modification after integrity check
 * - Refinement engine scope protection (proposals + applyProposal)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHardeningEngine } from '../../src/hardening/engine.js';
import { AuditPipeline } from '../../src/audit/pipeline.js';
import { createRefinementEngine } from '../../src/refinement/refinement-engine.js';
import { verifySkillIntegrity } from '../../src/skills/integrity.js';
import type {
  PlatformAdapter,
  ToolCallHandler,
  BootstrapHandler,
  BootstrapContext,
} from '../../src/adapters/types.js';
import type { CANSDocument } from '../../src/activation/cans-schema.js';
import {
  createTestWorkspace,
  syntheticNeurosurgeonCANS,
} from '../fixtures/synthetic-neurosurgeon.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock PlatformAdapter that captures handler registrations.
 */
function createMockAdapter(workspacePath: string): PlatformAdapter & {
  _toolCallHandler: ToolCallHandler | null;
  _bootstrapHandler: BootstrapHandler | null;
} {
  let toolCallHandler: ToolCallHandler | null = null;
  let bootstrapHandler: BootstrapHandler | null = null;

  return {
    platform: 'test',
    getWorkspacePath: () => workspacePath,
    onBeforeToolCall: vi.fn((handler: ToolCallHandler) => {
      toolCallHandler = handler;
    }),
    onAgentBootstrap: vi.fn((handler: BootstrapHandler) => {
      bootstrapHandler = handler;
    }),
    registerCliCommand: vi.fn(),
    registerBackgroundService: vi.fn(),
    registerSlashCommand: vi.fn(),
    log: vi.fn(),
    get _toolCallHandler() { return toolCallHandler; },
    get _bootstrapHandler() { return bootstrapHandler; },
  };
}

function readAuditEntries(workspacePath: string): Array<Record<string, unknown>> {
  const auditPath = join(workspacePath, '.careagent', 'AUDIT.log');
  if (!existsSync(auditPath)) return [];
  const content = readFileSync(auditPath, 'utf-8');
  return content
    .trimEnd()
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('INTG-02: Security Review', () => {
  let tmpDir: string;
  let adapter: ReturnType<typeof createMockAdapter>;
  let audit: AuditPipeline;
  let cans: CANSDocument;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-security-'));
    createTestWorkspace(tmpDir);
    adapter = createMockAdapter(tmpDir);
    audit = new AuditPipeline(tmpDir);
    cans = syntheticNeurosurgeonCANS as unknown as CANSDocument;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Layer 1: Tool Policy Lockdown (HARD-01)
  // -------------------------------------------------------------------------

  describe('Layer 1: Tool Policy Lockdown (HARD-01)', () => {
    it('blocks prohibited tools when CANS is active', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // WebSearch is not in neurosurgeon's permitted tools
      const result = engine.check({ toolName: 'WebSearch' });
      expect(result.allowed).toBe(false);
      expect(result.layer).toBe('tool-policy');
    });

    it('allows tools in the permitted set', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // chart_operative_note is in scope.permitted_actions
      const result = engine.check({ toolName: 'chart_operative_note' });
      expect(result.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Layer 2: Exec Allowlist (HARD-02)
  // -------------------------------------------------------------------------

  describe('Layer 2: Exec Allowlist (HARD-02)', () => {
    it('blocks unlisted exec commands', () => {
      // Need Bash in permitted_actions for tool-policy to pass first
      const cansWithBash = {
        ...cans,
        scope: {
          ...cans.scope,
          permitted_actions: [...cans.scope.permitted_actions, 'Bash'],
        },
      } as CANSDocument;

      const engine = createHardeningEngine();
      const localAdapter = createMockAdapter(tmpDir);
      const localAudit = new AuditPipeline(tmpDir, 'exec-test');
      engine.activate({ cans: cansWithBash, adapter: localAdapter, audit: localAudit });

      const result = engine.check({
        toolName: 'Bash',
        params: { command: 'rm -rf /' },
      });
      expect(result.allowed).toBe(false);
      expect(result.layer).toBe('exec-allowlist');
    });

    it('allows read-only utilities', () => {
      const cansWithBash = {
        ...cans,
        scope: {
          ...cans.scope,
          permitted_actions: [...cans.scope.permitted_actions, 'Bash'],
        },
      } as CANSDocument;

      const engine = createHardeningEngine();
      const localAdapter = createMockAdapter(tmpDir);
      const localAudit = new AuditPipeline(tmpDir, 'exec-allow-test');
      engine.activate({ cans: cansWithBash, adapter: localAdapter, audit: localAudit });

      const result = engine.check({
        toolName: 'Bash',
        params: { command: 'cat /etc/hostname' },
      });
      expect(result.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Layer 3: CANS Protocol Injection (HARD-03)
  // -------------------------------------------------------------------------

  describe('Layer 3: CANS Protocol Injection (HARD-03)', () => {
    it('injects protocol rules into bootstrap context', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      const context: BootstrapContext = { addFile: vi.fn() };
      adapter._bootstrapHandler!(context);

      expect(context.addFile).toHaveBeenCalledTimes(1);
      expect(context.addFile).toHaveBeenCalledWith(
        'CAREAGENT_PROTOCOL.md',
        expect.any(String),
      );

      const content = (context.addFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(content).toContain('Dr. Sarah Chen');
      expect(content).toContain('NEVER act outside these scope boundaries');
    });
  });

  // -------------------------------------------------------------------------
  // Layer 4: Docker Sandbox Detection (HARD-04)
  // -------------------------------------------------------------------------

  describe('Layer 4: Docker Sandbox Detection (HARD-04)', () => {
    it('reports Docker status without blocking', () => {
      // Enable docker_sandbox flag
      const cansWithDocker = {
        ...cans,
        hardening: { ...cans.hardening, docker_sandbox: true },
      } as CANSDocument;

      const engine = createHardeningEngine();
      const localAdapter = createMockAdapter(tmpDir);
      const localAudit = new AuditPipeline(tmpDir, 'docker-test');
      engine.activate({ cans: cansWithDocker, adapter: localAdapter, audit: localAudit });

      // Check a permitted tool to go through all layers
      const result = engine.check({ toolName: 'chart_operative_note' });

      // Layer 4 never returns allowed: false (report-only)
      expect(result.allowed).toBe(true);

      // Audit log should contain docker-sandbox layer entry
      const entries = readAuditEntries(tmpDir);
      const dockerEntry = entries.find(
        (e) =>
          e.action === 'hardening_check' &&
          (e.details as Record<string, unknown>)?.layer === 'docker-sandbox',
      );
      expect(dockerEntry).toBeDefined();
      expect(dockerEntry!.outcome).toBe('allowed');
    });
  });

  // -------------------------------------------------------------------------
  // Layer 5: Safety Guard (HARD-05)
  // -------------------------------------------------------------------------

  describe('Layer 5: Safety Guard (HARD-05)', () => {
    it('engine short-circuits on first deny', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // Call check on a prohibited tool
      engine.check({ toolName: 'unknown_unauthorized_tool' });

      // Read audit log entries for this check
      const entries = readAuditEntries(tmpDir);
      const hardeningEntries = entries.filter((e) => e.action === 'hardening_check');

      // Should show the denying layer (tool-policy) but NOT subsequent layers
      const denied = hardeningEntries.find((e) => e.outcome === 'denied');
      expect(denied).toBeDefined();
      expect((denied!.details as Record<string, unknown>).layer).toBe('tool-policy');

      // No exec-allowlist, cans-injection, or docker-sandbox entries for this check
      // (because short-circuit happened at tool-policy)
      const traceId = denied!.trace_id;
      const sameTraceEntries = hardeningEntries.filter((e) => e.trace_id === traceId);
      expect(sameTraceEntries.length).toBe(1); // Only the denying layer
    });
  });

  // -------------------------------------------------------------------------
  // Layer 6: Audit Trail Integration (HARD-06)
  // -------------------------------------------------------------------------

  describe('Layer 6: Audit Trail Integration (HARD-06)', () => {
    it('every layer check result is logged to AUDIT.log', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // Perform a tool check (allowed tool goes through all 4 layers)
      engine.check({ toolName: 'chart_operative_note' });

      const entries = readAuditEntries(tmpDir);
      const hardeningEntries = entries.filter((e) => e.action === 'hardening_check');

      // Should have entries for all 4 layers
      expect(hardeningEntries.length).toBe(4);

      // Each entry should have layer information
      const layers = hardeningEntries.map(
        (e) => (e.details as Record<string, unknown>).layer,
      );
      expect(layers).toContain('tool-policy');
      expect(layers).toContain('exec-allowlist');
      expect(layers).toContain('cans-injection');
      expect(layers).toContain('docker-sandbox');
    });
  });

  // -------------------------------------------------------------------------
  // Adversarial Scenarios
  // -------------------------------------------------------------------------

  describe('Adversarial Scenarios', () => {
    it('blocks tool call that would violate scope boundaries', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // prescribe_controlled_substances is in prohibited_actions
      const result = engine.check({ toolName: 'prescribe_controlled_substances' });
      expect(result.allowed).toBe(false);
      expect(result.layer).toBe('tool-policy');
    });

    it('detects tampered audit log via chain verification', () => {
      // Write several audit entries normally via the pipeline
      for (let i = 0; i < 5; i++) {
        audit.log({
          action: 'test_entry',
          actor: 'system',
          outcome: 'allowed',
          details: { index: i },
        });
      }

      // Verify chain is intact before tampering
      const beforeResult = audit.verifyChain();
      expect(beforeResult.valid).toBe(true);
      expect(beforeResult.entries).toBe(5);

      // Manually edit one line in the AUDIT.log file (corrupt content)
      const auditPath = join(tmpDir, '.careagent', 'AUDIT.log');
      const rawContent = readFileSync(auditPath, 'utf-8');
      const lines = rawContent.split('\n');

      // Modify the 3rd entry (index 2) by changing its content
      const parsed = JSON.parse(lines[2]);
      parsed.action = 'tampered_entry';
      lines[2] = JSON.stringify(parsed);

      writeFileSync(auditPath, lines.join('\n'));

      // Create a new AuditPipeline to read the tampered file
      const tamperedAudit = new AuditPipeline(tmpDir, 'tamper-test');
      const afterResult = tamperedAudit.verifyChain();

      // Chain verification should detect the tampering
      expect(afterResult.valid).toBe(false);
    });

    it('rejects skill with modified files after integrity check', () => {
      // Create a skill directory with a valid manifest and matching files
      const skillDir = join(tmpDir, 'test-skill');
      mkdirSync(skillDir, { recursive: true });

      const originalContent = '# Test Skill\n\nA clinical skill for testing.\n';
      writeFileSync(join(skillDir, 'SKILL.md'), originalContent);

      const hash = createHash('sha256').update(originalContent, 'utf-8').digest('hex');
      const manifest = {
        skill_id: 'test-skill',
        version: '1.0.0',
        requires: {},
        files: { 'SKILL.md': hash },
        pinned: true,
        approved_version: '1.0.0',
      };

      writeFileSync(
        join(skillDir, 'skill-manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      // Verify integrity passes before modification
      const beforeResult = verifySkillIntegrity(skillDir, manifest);
      expect(beforeResult.valid).toBe(true);

      // Modify one skill file content after creating the manifest
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        originalContent + '\n<!-- malicious injection -->',
      );

      // Integrity check should fail
      const afterResult = verifySkillIntegrity(skillDir, manifest);
      expect(afterResult.valid).toBe(false);
      expect(afterResult.reason).toContain('Hash mismatch');
    });

    it('refinement engine refuses to propose scope changes', () => {
      const engine = createRefinementEngine({
        workspacePath: tmpDir,
        audit,
        sessionId: 'scope-test',
      });

      // Record 12 observations targeting scope.prohibited_actions
      for (let i = 0; i < 12; i++) {
        engine.observe({
          category: 'voice',
          field_path: 'scope.prohibited_actions',
          declared_value: ['prescribe_controlled_substances'],
          observed_value: [],
        });
      }

      // Should produce zero proposals (scope is sacrosanct)
      const proposals = engine.generateProposals();
      expect(proposals.length).toBe(0);
    });

    it('refinement engine applyProposal throws on scope field', () => {
      const engine = createRefinementEngine({
        workspacePath: tmpDir,
        audit,
        sessionId: 'scope-apply-test',
      });

      // Record enough non-scope observations to generate a real proposal
      for (let i = 0; i < 6; i++) {
        engine.observe({
          category: 'voice',
          field_path: 'clinical_voice.tone',
          declared_value: 'formal',
          observed_value: 'conversational',
        });
      }

      const proposals = engine.generateProposals();
      expect(proposals.length).toBe(1);

      // Manually craft the proposal ID to target a scope field
      // We need to test that the internal applyProposal rejects scope fields.
      // The easiest way is to directly resolve a proposal that has been
      // tampered to target a scope field. We'll use the actual proposal
      // but modify its field_path in the queue file.
      const proposalId = proposals[0].id;

      // Tamper with the proposal in the queue file to target scope field
      const queuePath = join(tmpDir, '.careagent', 'proposals.json');
      const queueContent = JSON.parse(readFileSync(queuePath, 'utf-8'));
      queueContent.proposals[0].field_path = 'scope.prohibited_actions';
      queueContent.proposals[0].proposed_value = [];
      writeFileSync(queuePath, JSON.stringify(queueContent, null, 2));

      // Create a new engine to pick up the tampered queue
      const engine2 = createRefinementEngine({
        workspacePath: tmpDir,
        audit,
        sessionId: 'scope-apply-test-2',
      });

      // Attempting to accept the tampered proposal should throw
      expect(() => engine2.resolveProposal(proposalId, 'accept')).toThrow('SAFETY VIOLATION');
    });
  });
});
