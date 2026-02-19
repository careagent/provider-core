import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupCanary } from '../../../src/hardening/canary.js';
import type { PlatformAdapter } from '../../../src/adapters/types.js';
import type { AuditPipeline, AuditLogInput } from '../../../src/audit/pipeline.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockAdapter(): PlatformAdapter {
  return {
    platform: 'test',
    getWorkspacePath: () => '/tmp/test',
    onBeforeToolCall: vi.fn(),
    onAgentBootstrap: vi.fn(),
    registerCliCommand: vi.fn(),
    registerBackgroundService: vi.fn(),
    registerSlashCommand: vi.fn(),
    log: vi.fn(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupCanary', () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let audit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = createMockAdapter();
    audit = createMockAudit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an object with isVerified() and markVerified() methods', () => {
    const canary = setupCanary(adapter, audit);
    expect(typeof canary.isVerified).toBe('function');
    expect(typeof canary.markVerified).toBe('function');
  });

  it('isVerified() returns false initially', () => {
    const canary = setupCanary(adapter, audit);
    expect(canary.isVerified()).toBe(false);
  });

  it('after markVerified(), isVerified() returns true', () => {
    const canary = setupCanary(adapter, audit);
    canary.markVerified();
    expect(canary.isVerified()).toBe(true);
  });

  it('markVerified() calls audit.log() with action hook_canary, outcome allowed, status verified', () => {
    const canary = setupCanary(adapter, audit);
    canary.markVerified();
    expect(audit.log).toHaveBeenCalledTimes(1);
    const entry = audit._calls[0];
    expect(entry.action).toBe('hook_canary');
    expect(entry.outcome).toBe('allowed');
    expect(entry.details).toHaveProperty('status', 'verified');
  });

  it('multiple markVerified() calls only log once (idempotent)', () => {
    const canary = setupCanary(adapter, audit);
    canary.markVerified();
    canary.markVerified();
    canary.markVerified();
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('after 30 seconds without markVerified(), adapter.log(warn) is called with degradation warning', () => {
    setupCanary(adapter, audit);
    vi.advanceTimersByTime(30_000);
    expect(adapter.log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('before_tool_call hook did NOT fire'),
    );
  });

  it('after 30 seconds without markVerified(), audit.log() is called with outcome error and status not_fired', () => {
    setupCanary(adapter, audit);
    vi.advanceTimersByTime(30_000);
    // Find the timeout audit entry (may be the only one, or after other entries)
    const timeoutEntry = audit._calls.find(
      (c) => c.action === 'hook_canary' && c.outcome === 'error',
    );
    expect(timeoutEntry).toBeDefined();
    expect(timeoutEntry!.details).toHaveProperty('status', 'not_fired');
  });

  it('if markVerified() is called before timeout, the timeout warning does NOT fire', () => {
    const canary = setupCanary(adapter, audit);
    canary.markVerified();
    vi.advanceTimersByTime(35_000);
    // adapter.log should NOT have been called with 'warn'
    const warnCalls = (adapter.log as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'warn',
    );
    expect(warnCalls.length).toBe(0);
  });

  it('returned timeout has .unref() called (does not keep Node.js alive)', () => {
    // Spy on setTimeout to capture the returned timeout object
    const originalSetTimeout = globalThis.setTimeout;
    const unrefSpy = vi.fn();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: (...args: unknown[]) => void, delay?: number) => {
      const timeout = originalSetTimeout(fn, delay);
      timeout.unref = unrefSpy;
      return timeout;
    }) as typeof globalThis.setTimeout);

    setupCanary(adapter, audit);
    expect(unrefSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
