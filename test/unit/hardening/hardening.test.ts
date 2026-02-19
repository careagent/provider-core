import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHardeningEngine } from '../../../src/hardening/engine.js';
import type { PlatformAdapter, ToolCallHandler, BootstrapHandler, BootstrapContext } from '../../../src/adapters/types.js';
import type { AuditPipeline, AuditLogInput } from '../../../src/audit/pipeline.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockAdapter(): PlatformAdapter & {
  _toolCallHandler: ToolCallHandler | null;
  _bootstrapHandler: BootstrapHandler | null;
} {
  let toolCallHandler: ToolCallHandler | null = null;
  let bootstrapHandler: BootstrapHandler | null = null;

  return {
    platform: 'test',
    getWorkspacePath: () => '/tmp/test',
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

function createMockAudit(): AuditPipeline & { _calls: AuditLogInput[] } {
  const calls: AuditLogInput[] = [];
  return {
    log: vi.fn((input: AuditLogInput) => { calls.push(input); }),
    logBlocked: vi.fn(),
    createTraceId: vi.fn(() => 'test-trace-id'),
    getSessionId: vi.fn(() => 'test-session-id'),
    verifyChain: vi.fn(() => ({ valid: true, entries: 0 })),
    _calls: calls,
  } as unknown as AuditPipeline & { _calls: AuditLogInput[] };
}

function makeCans(overrides?: Partial<CANSDocument>): CANSDocument {
  return {
    ...validCANSData,
    ...overrides,
  } as CANSDocument;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHardeningEngine', () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let audit: ReturnType<typeof createMockAudit>;
  let cans: CANSDocument;

  beforeEach(() => {
    adapter = createMockAdapter();
    audit = createMockAudit();
    cans = makeCans();
  });

  // ---- Hook registration tests ----

  it('activate() registers a before_tool_call handler via adapter.onBeforeToolCall', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    expect(adapter.onBeforeToolCall).toHaveBeenCalledTimes(1);
    expect(typeof adapter._toolCallHandler).toBe('function');
  });

  it('activate() registers a bootstrap handler via adapter.onAgentBootstrap', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    expect(adapter.onAgentBootstrap).toHaveBeenCalledTimes(1);
    expect(typeof adapter._bootstrapHandler).toBe('function');
  });

  // ---- check() guard ----

  it('check() before activate() throws "Engine not activated"', () => {
    const engine = createHardeningEngine();
    expect(() => engine.check({ toolName: 'anything' })).toThrow('Engine not activated');
  });

  // ---- check() allow/deny ----

  it('check() with a tool in permitted_actions returns { allowed: true }', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    const result = engine.check({ toolName: 'chart_operative_note' });
    expect(result.allowed).toBe(true);
  });

  it('check() with a tool in prohibited_actions returns deny with layer "tool-policy"', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    const result = engine.check({ toolName: 'prescribe_controlled_substances' });
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('tool-policy');
    expect(result.reason).toContain('prohibited_actions');
  });

  it('check() with a non-allowlisted exec command returns deny', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    const result = engine.check({
      toolName: 'Bash',
      params: { command: 'rm -rf /' },
    });
    expect(result.allowed).toBe(false);
  });

  // ---- Short-circuit-on-deny ----

  it('check() short-circuits: if Layer 1 denies, only 1 audit entry is logged', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    // Tool not in permitted_actions -> Layer 1 denies
    engine.check({ toolName: 'unknown_tool' });
    // Should have exactly 1 audit entry (only Layer 1 evaluated)
    expect(audit._calls.length).toBe(1);
    expect(audit._calls[0].details).toHaveProperty('layer', 'tool-policy');
  });

  it('check() when all layers allow: audit log has 4 entries (one per layer)', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    engine.check({ toolName: 'chart_operative_note' });
    expect(audit._calls.length).toBe(4);
  });

  // ---- Audit fields ----

  it('check() deny writes blocking_layer and blocked_reason to audit', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    engine.check({ toolName: 'prescribe_controlled_substances' });
    const denyEntry = audit._calls[0];
    expect(denyEntry.blocking_layer).toBe('tool-policy');
    expect(denyEntry.blocked_reason).toBeTruthy();
  });

  it('check() allow writes layer name to audit details', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    engine.check({ toolName: 'chart_operative_note' });
    for (const entry of audit._calls) {
      expect(entry.details).toHaveProperty('layer');
    }
  });

  // ---- injectProtocol ----

  it('injectProtocol() returns array of strings (protocol rule lines)', () => {
    const engine = createHardeningEngine();
    const lines = engine.injectProtocol(cans);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(typeof line).toBe('string');
    }
  });

  // ---- Hook handler behavior ----

  it('bootstrap handler calls injectProtocol and passes content to context.addFile', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    const context: BootstrapContext = { addFile: vi.fn() };
    adapter._bootstrapHandler!(context);
    expect(context.addFile).toHaveBeenCalledTimes(1);
    expect(context.addFile).toHaveBeenCalledWith(
      'CAREAGENT_PROTOCOL.md',
      expect.any(String),
    );
  });

  it('before_tool_call handler calls engine.check() and returns { block: true, blockReason } on deny', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    const result = adapter._toolCallHandler!({ toolName: 'prescribe_controlled_substances' });
    expect(result.block).toBe(true);
    expect(result.blockReason).toBeTruthy();
  });

  it('before_tool_call handler returns { block: false } on allow', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    const result = adapter._toolCallHandler!({ toolName: 'chart_operative_note' });
    expect(result.block).toBe(false);
  });
});
