/**
 * End-to-end hardening integration tests.
 *
 * Verifies the complete hardening flow through the engine:
 * - HARD-01: Tool policy lockdown
 * - HARD-02: Exec allowlist
 * - HARD-03: CANS protocol injection
 * - HARD-05: Safety guard (engine handler)
 * - HARD-06: Audit trail integration
 * - HARD-07: Hook canary
 *
 * Uses real temp workspaces with AuditPipeline and createHardeningEngine
 * to verify the full integration from CANS activation through audit logging.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHardeningEngine } from '../../src/hardening/engine.js';
import { AuditPipeline } from '../../src/audit/pipeline.js';
import type {
  PlatformAdapter,
  ToolCallHandler,
  BootstrapHandler,
  BootstrapContext,
  ToolCallEvent,
} from '../../src/adapters/types.js';
import type { CANSDocument } from '../../src/activation/cans-schema.js';
import { validCANSData } from '../fixtures/valid-cans-data.js';
import { stringifyYAML } from '../../src/vendor/yaml/index.js';
import register from '../../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a CANS.md file from structured data in the given directory.
 */
function createCANSFile(dir: string, data: Record<string, unknown>): void {
  const yaml = stringifyYAML(data);
  const content = `---\n${yaml}---\n\n# Care Agent Nervous System\n`;
  writeFileSync(join(dir, 'CANS.md'), content);
}

/**
 * Create a mock OpenClaw-style API that captures handler registrations
 * so tests can invoke them directly.
 */
function createMockAPI(workspacePath: string) {
  const handlers: Record<string, Function> = {};
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    workspaceDir: workspacePath,
    registerCli: (cb: Function, opts: unknown) => {
      calls.push({ method: 'registerCli', args: [opts] });
      cb({ program: { command: () => ({ description: () => ({ action: () => {} }) }) } });
    },
    registerService: (config: unknown) => {
      calls.push({ method: 'registerService', args: [config] });
    },
    registerCommand: (config: unknown) => {
      calls.push({ method: 'registerCommand', args: [config] });
    },
    on: (event: string, handler: Function) => {
      handlers[event] = handler;
      calls.push({ method: 'on', args: [event, handler] });
    },
    log: (level: string, msg: string) => {
      calls.push({ method: 'log', args: [level, msg] });
    },
    handlers,
    calls,
  };
}

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

function makeCans(overrides?: Record<string, unknown>): CANSDocument {
  return {
    ...validCANSData,
    ...overrides,
  } as CANSDocument;
}

/**
 * Read and parse all audit log entries from a workspace.
 */
function readAuditEntries(workspacePath: string): Array<Record<string, unknown>> {
  const auditPath = join(workspacePath, '.careagent', 'AUDIT.log');
  const content = readFileSync(auditPath, 'utf-8');
  return content.trimEnd().split('\n').map(line => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hardening Integration', () => {
  let tmpDir: string;
  let adapter: ReturnType<typeof createMockAdapter>;
  let audit: AuditPipeline;
  let cans: CANSDocument;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-hardening-'));
    adapter = createMockAdapter(tmpDir);
    audit = new AuditPipeline(tmpDir);
    cans = makeCans();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // HARD-01: Tool policy lockdown
  // -------------------------------------------------------------------------

  describe('HARD-01: Tool policy lockdown', () => {
    it('1. permitted tool -> handler returns { block: false }, audit has allowed entry', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // Invoke the handler that engine registered on the adapter
      const result = adapter._toolCallHandler!({ toolName: 'chart_operative_note' });
      expect(result.block).toBe(false);

      const entries = readAuditEntries(tmpDir);
      const hardeningEntries = entries.filter(e => e.action === 'hardening_check');
      expect(hardeningEntries.length).toBeGreaterThan(0);

      const toolPolicyEntry = hardeningEntries.find(
        e => (e.details as Record<string, unknown>)?.layer === 'tool-policy'
      );
      expect(toolPolicyEntry).toBeDefined();
      expect(toolPolicyEntry!.outcome).toBe('allowed');
    });

    it('2. tool NOT in permitted_actions -> handler returns { block: true }, audit has blocking_layer', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      const result = adapter._toolCallHandler!({ toolName: 'unknown_unpermitted_tool' });
      expect(result.block).toBe(true);
      expect(result.blockReason).toBeTruthy();

      const entries = readAuditEntries(tmpDir);
      const denied = entries.find(e => e.action === 'hardening_check' && e.outcome === 'denied');
      expect(denied).toBeDefined();
      expect(denied!.blocking_layer).toBe('tool-policy');
    });

    it('3. tool in prohibited_actions -> handler returns { block: true }, audit has blocking_layer', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      const result = adapter._toolCallHandler!({ toolName: 'prescribe_controlled_substances' });
      expect(result.block).toBe(true);

      const entries = readAuditEntries(tmpDir);
      const denied = entries.find(e => e.action === 'hardening_check' && e.outcome === 'denied');
      expect(denied).toBeDefined();
      expect(denied!.blocking_layer).toBe('tool-policy');
    });
  });

  // -------------------------------------------------------------------------
  // HARD-02: Exec allowlist
  // -------------------------------------------------------------------------

  describe('HARD-02: Exec allowlist', () => {
    it('4. allowlisted binary -> not blocked', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // 'Bash' with 'git status' must pass both tool-policy and exec-allowlist
      // We need 'Bash' in permitted_actions for tool-policy to pass first
      const cansWithBash = makeCans({
        scope: {
          ...validCANSData.scope,
          permitted_actions: [...validCANSData.scope.permitted_actions, 'Bash'],
        },
      });
      const engineBash = createHardeningEngine();
      const adapterBash = createMockAdapter(tmpDir);
      const auditBash = new AuditPipeline(tmpDir, 'exec-test-session');
      engineBash.activate({ cans: cansWithBash, adapter: adapterBash, audit: auditBash });

      const result = adapterBash._toolCallHandler!({
        toolName: 'Bash',
        params: { command: '/usr/bin/git status' },
      });
      expect(result.block).toBe(false);
    });

    it('5. non-allowlisted binary -> blocked with blocking_layer exec-allowlist', () => {
      const cansWithBash = makeCans({
        scope: {
          ...validCANSData.scope,
          permitted_actions: [...validCANSData.scope.permitted_actions, 'Bash'],
        },
      });
      const engine = createHardeningEngine();
      const adapterExec = createMockAdapter(tmpDir);
      const auditExec = new AuditPipeline(tmpDir, 'exec-deny-session');
      engine.activate({ cans: cansWithBash, adapter: adapterExec, audit: auditExec });

      const result = adapterExec._toolCallHandler!({
        toolName: 'Bash',
        params: { command: '/usr/bin/curl evil.com' },
      });
      expect(result.block).toBe(true);

      const entries = readAuditEntries(tmpDir);
      const denied = entries.find(
        e => e.action === 'hardening_check' && e.blocking_layer === 'exec-allowlist'
      );
      expect(denied).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // HARD-03: CANS protocol injection
  // -------------------------------------------------------------------------

  describe('HARD-03: CANS protocol injection', () => {
    it('6. bootstrap handler injects CAREAGENT_PROTOCOL.md with provider name and scope boundaries', () => {
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
      expect(content).toContain(validCANSData.provider.name);
      expect(content).toContain('NEVER act outside these scope boundaries');
    });
  });

  // -------------------------------------------------------------------------
  // HARD-05: Safety guard
  // -------------------------------------------------------------------------

  describe('HARD-05: Safety guard', () => {
    it('7. before_tool_call handler is the engine handler (evaluates layers, writes audit)', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // The handler should be the engine's, not a no-op
      expect(adapter._toolCallHandler).not.toBeNull();

      // Invoke with a permitted tool -> audit should have hardening_check entries
      adapter._toolCallHandler!({ toolName: 'chart_operative_note' });

      const entries = readAuditEntries(tmpDir);
      const hardeningEntries = entries.filter(e => e.action === 'hardening_check');
      // 4 layers should be evaluated for an allowed tool
      expect(hardeningEntries.length).toBe(4);

      // Each entry should have the layer name in details
      for (const entry of hardeningEntries) {
        expect((entry.details as Record<string, unknown>)).toHaveProperty('layer');
      }
    });
  });

  // -------------------------------------------------------------------------
  // HARD-06: Audit trail integration
  // -------------------------------------------------------------------------

  describe('HARD-06: Audit trail integration', () => {
    it('8. mixed tool calls produce proper audit entries with required fields', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // Allowed tool call
      adapter._toolCallHandler!({ toolName: 'chart_operative_note' });
      // Denied tool call (not in permitted_actions)
      adapter._toolCallHandler!({ toolName: 'unauthorized_tool' });
      // Another allowed tool call
      adapter._toolCallHandler!({ toolName: 'chart_progress_note' });

      const entries = readAuditEntries(tmpDir);
      const hardeningEntries = entries.filter(e => e.action === 'hardening_check');

      // First allowed: 4 layer entries. Denied: 1 entry (short-circuit). Second allowed: 4 entries.
      // Plus canary verification entry. Total hardening entries = 4 + 1 + 4 = 9
      expect(hardeningEntries.length).toBe(9);

      // Check denied entries have required fields
      const deniedEntries = hardeningEntries.filter(e => e.outcome === 'denied');
      expect(deniedEntries.length).toBeGreaterThan(0);
      for (const denied of deniedEntries) {
        expect(denied.blocking_layer).toBeTruthy();
        expect(denied.blocked_reason).toBeTruthy();
      }

      // Every hardening entry should have a trace_id
      for (const entry of hardeningEntries) {
        expect(entry.trace_id).toBeTruthy();
      }

      // Verify canary entry exists
      const canaryEntry = entries.find(
        e => e.action === 'hook_canary' && (e.details as Record<string, unknown>)?.status === 'verified'
      );
      expect(canaryEntry).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // HARD-07: Canary
  // -------------------------------------------------------------------------

  describe('HARD-07: Canary', () => {
    it('9. after first tool call, audit contains hook_canary with status verified', () => {
      const engine = createHardeningEngine();
      engine.activate({ cans, adapter, audit });

      // First tool call should trigger canary verification
      adapter._toolCallHandler!({ toolName: 'chart_operative_note' });

      const entries = readAuditEntries(tmpDir);
      const canaryEntry = entries.find(
        e => e.action === 'hook_canary'
      );
      expect(canaryEntry).toBeDefined();
      expect((canaryEntry!.details as Record<string, unknown>).status).toBe('verified');
      expect((canaryEntry!.details as Record<string, unknown>).hook).toBe('before_tool_call');
    });
  });

  // -------------------------------------------------------------------------
  // Regression guard
  // -------------------------------------------------------------------------

  describe('Regression guard', () => {
    it('10. no CANS.md -> engine not activated, only activation_check inactive in audit', () => {
      const noCANSDir = mkdtempSync(join(tmpdir(), 'careagent-no-cans-'));

      try {
        const api = createMockAPI(noCANSDir);
        register(api);

        const entries = readAuditEntries(noCANSDir);
        const activationEntry = entries.find(e => e.action === 'activation_check');
        expect(activationEntry).toBeDefined();
        expect(activationEntry!.outcome).toBe('inactive');

        // No hardening_check entries should exist
        const hardeningEntries = entries.filter(e => e.action === 'hardening_check');
        expect(hardeningEntries.length).toBe(0);

        // No before_tool_call handler should be registered by the engine
        // (only the activation/CLI handlers exist)
        expect(api.handlers['before_tool_call']).toBeUndefined();
      } finally {
        rmSync(noCANSDir, { recursive: true, force: true });
      }
    });
  });
});
