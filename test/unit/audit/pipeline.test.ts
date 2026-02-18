import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import type { AuditEntry } from '../../../src/audit/entry-schema.js';

// UUID v4 pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('AuditPipeline', () => {
  let tmpDir: string;
  let pipeline: AuditPipeline;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'audit-pipeline-test-'));
    pipeline = new AuditPipeline(tmpDir, 'test-session-id');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function getLogPath(): string {
    return join(tmpDir, '.careagent', 'AUDIT.log');
  }

  function readEntries(): AuditEntry[] {
    const content = readFileSync(getLogPath(), 'utf-8').trimEnd();
    if (!content) return [];
    return content.split('\n').map(line => JSON.parse(line));
  }

  it('log() writes an entry to AUDIT.log in .careagent/ directory', () => {
    pipeline.log({
      action: 'test-action',
      outcome: 'allowed',
    });

    expect(existsSync(getLogPath())).toBe(true);
    const entries = readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('test-action');
  });

  it('entry has all required fields: schema_version, timestamp, session_id, trace_id, action, actor, outcome, prev_hash', () => {
    pipeline.log({
      action: 'check-fields',
      outcome: 'allowed',
    });

    const entry = readEntries()[0];
    expect(entry.schema_version).toBe('1');
    expect(entry.timestamp).toBeDefined();
    expect(entry.session_id).toBe('test-session-id');
    expect(entry.trace_id).toBeDefined();
    expect(entry.action).toBe('check-fields');
    expect(entry.actor).toBe('system'); // default
    expect(entry.outcome).toBe('allowed');
    expect(entry).toHaveProperty('prev_hash');
  });

  it('logBlocked() includes blocked_reason, blocking_layer, and action_state', () => {
    pipeline.logBlocked({
      action: 'prescribe-medication',
      target: 'patient-456',
      blocked_reason: 'Not in scope of practice',
      blocking_layer: 'hardening',
      details: { medication: 'controlled-substance' },
    });

    const entry = readEntries()[0];
    expect(entry.blocked_reason).toBe('Not in scope of practice');
    expect(entry.blocking_layer).toBe('hardening');
    expect(entry.action_state).toBe('system-blocked');
    expect(entry.target).toBe('patient-456');
    expect(entry.details).toEqual({ medication: 'controlled-substance' });
  });

  it('logBlocked() sets outcome to denied and action_state to system-blocked by default', () => {
    pipeline.logBlocked({
      action: 'blocked-action',
      blocked_reason: 'test reason',
      blocking_layer: 'test-layer',
    });

    const entry = readEntries()[0];
    expect(entry.outcome).toBe('denied');
    expect(entry.action_state).toBe('system-blocked');
    expect(entry.actor).toBe('system');
  });

  it('multiple log() calls produce valid hash chain', () => {
    for (let i = 0; i < 5; i++) {
      pipeline.log({
        action: `action-${i}`,
        outcome: 'allowed',
      });
    }

    const result = pipeline.verifyChain();
    expect(result).toEqual({ valid: true, entries: 5 });
  });

  it('verifyChain() returns valid: true after normal logging', () => {
    pipeline.log({ action: 'first', outcome: 'allowed' });
    pipeline.log({ action: 'second', outcome: 'denied', actor: 'agent' });
    pipeline.logBlocked({
      action: 'third',
      blocked_reason: 'test',
      blocking_layer: 'scope',
    });

    const result = pipeline.verifyChain();
    expect(result).toEqual({ valid: true, entries: 3 });
  });

  it('session ID is consistent across all entries', () => {
    pipeline.log({ action: 'a', outcome: 'allowed' });
    pipeline.log({ action: 'b', outcome: 'allowed' });
    pipeline.log({ action: 'c', outcome: 'allowed' });

    const entries = readEntries();
    for (const entry of entries) {
      expect(entry.session_id).toBe('test-session-id');
    }
  });

  it('trace ID can be overridden for correlated events', () => {
    const traceId = 'custom-trace-id-123';
    pipeline.log({
      action: 'correlated-action',
      outcome: 'allowed',
      trace_id: traceId,
    });

    const entry = readEntries()[0];
    expect(entry.trace_id).toBe(traceId);
  });

  it('createTraceId() returns a valid UUID', () => {
    const traceId = pipeline.createTraceId();
    expect(traceId).toMatch(UUID_PATTERN);

    // Each call produces a unique ID
    const traceId2 = pipeline.createTraceId();
    expect(traceId2).toMatch(UUID_PATTERN);
    expect(traceId).not.toBe(traceId2);
  });

  it('all 5 action states are accepted', () => {
    const states = [
      'ai-proposed',
      'provider-approved',
      'provider-modified',
      'provider-rejected',
      'system-blocked',
    ] as const;

    for (const state of states) {
      pipeline.log({
        action: `test-${state}`,
        outcome: 'allowed',
        action_state: state,
      });
    }

    const entries = readEntries();
    expect(entries).toHaveLength(5);
    for (let i = 0; i < states.length; i++) {
      expect(entries[i].action_state).toBe(states[i]);
    }
  });

  it('audit file is created in .careagent/AUDIT.log', () => {
    pipeline.log({ action: 'init', outcome: 'active' });

    const expectedPath = join(tmpDir, '.careagent', 'AUDIT.log');
    expect(existsSync(expectedPath)).toBe(true);

    const content = readFileSync(expectedPath, 'utf-8');
    expect(content).toContain('"action":"init"');
  });
});
