import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { AuditWriter } from '../../../src/audit/writer.js';
import type { AuditEntry } from '../../../src/audit/entry-schema.js';

function makeEntry(overrides: Partial<Omit<AuditEntry, 'prev_hash'>> = {}): Omit<AuditEntry, 'prev_hash'> {
  return {
    schema_version: '1',
    timestamp: new Date().toISOString(),
    session_id: 'test-session',
    trace_id: 'test-trace',
    action: 'test-action',
    actor: 'system',
    outcome: 'allowed',
    ...overrides,
  };
}

function sha256(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

describe('AuditWriter', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'));
    logPath = join(tmpDir, 'AUDIT.log');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('first entry has prev_hash: null', () => {
    const writer = new AuditWriter(logPath);
    writer.append(makeEntry());

    const content = readFileSync(logPath, 'utf-8').trimEnd();
    const parsed: AuditEntry = JSON.parse(content);
    expect(parsed.prev_hash).toBeNull();
  });

  it('second entry has prev_hash equal to SHA-256 of first entry JSON', () => {
    const writer = new AuditWriter(logPath);
    writer.append(makeEntry({ action: 'first' }));
    writer.append(makeEntry({ action: 'second' }));

    const lines = readFileSync(logPath, 'utf-8').trimEnd().split('\n');
    expect(lines).toHaveLength(2);

    const firstLine = lines[0];
    const secondEntry: AuditEntry = JSON.parse(lines[1]);

    expect(secondEntry.prev_hash).toBe(sha256(firstLine));
  });

  it('verifyChain() returns valid: true after writing 5 entries', () => {
    const writer = new AuditWriter(logPath);
    for (let i = 0; i < 5; i++) {
      writer.append(makeEntry({ action: `action-${i}` }));
    }

    const result = writer.verifyChain();
    expect(result).toEqual({ valid: true, entries: 5 });
  });

  it('detects modification of an entry in the middle', () => {
    const writer = new AuditWriter(logPath);
    for (let i = 0; i < 5; i++) {
      writer.append(makeEntry({ action: `action-${i}` }));
    }

    // Tamper with the third entry (index 2)
    const lines = readFileSync(logPath, 'utf-8').trimEnd().split('\n');
    const tampered: AuditEntry = JSON.parse(lines[2]);
    tampered.action = 'TAMPERED';
    lines[2] = JSON.stringify(tampered);
    writeFileSync(logPath, lines.join('\n') + '\n');

    const result = writer.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
    expect(result.error).toBeDefined();
  });

  it('detects deletion of an entry from the middle', () => {
    const writer = new AuditWriter(logPath);
    for (let i = 0; i < 5; i++) {
      writer.append(makeEntry({ action: `action-${i}` }));
    }

    // Remove the third entry (index 2)
    const lines = readFileSync(logPath, 'utf-8').trimEnd().split('\n');
    lines.splice(2, 1);
    writeFileSync(logPath, lines.join('\n') + '\n');

    const result = writer.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
  });

  it('recoverLastHash works after creating a new writer on existing log', () => {
    const writer1 = new AuditWriter(logPath);
    writer1.append(makeEntry({ action: 'first' }));
    writer1.append(makeEntry({ action: 'second' }));

    // Create a new writer on the same log
    const writer2 = new AuditWriter(logPath);
    writer2.append(makeEntry({ action: 'third' }));

    // The chain should still be valid
    const result = writer2.verifyChain();
    expect(result).toEqual({ valid: true, entries: 3 });

    // The third entry's prev_hash should match the hash of the second line
    const lines = readFileSync(logPath, 'utf-8').trimEnd().split('\n');
    const thirdEntry: AuditEntry = JSON.parse(lines[2]);
    expect(thirdEntry.prev_hash).toBe(sha256(lines[1]));
  });

  it('verifyChain() returns valid: true, entries: 0 for empty log file', () => {
    writeFileSync(logPath, '');
    const writer = new AuditWriter(logPath);
    const result = writer.verifyChain();
    expect(result).toEqual({ valid: true, entries: 0 });
  });

  it('verifyChain() returns valid: true, entries: 0 for nonexistent log file', () => {
    const nonexistentPath = join(tmpDir, 'does-not-exist.log');
    const writer = new AuditWriter(nonexistentPath);
    const result = writer.verifyChain();
    expect(result).toEqual({ valid: true, entries: 0 });
  });

  it('entry contains all expected fields', () => {
    const writer = new AuditWriter(logPath);
    writer.append(makeEntry({
      action: 'prescribe-medication',
      actor: 'agent',
      outcome: 'denied',
      action_state: 'system-blocked',
      target: 'patient-123',
      details: { medication: 'amoxicillin', dose: '500mg' },
      blocked_reason: 'Outside scope of practice',
      blocking_layer: 'hardening',
    }));

    const content = readFileSync(logPath, 'utf-8').trimEnd();
    const parsed: AuditEntry = JSON.parse(content);

    expect(parsed.schema_version).toBe('1');
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.session_id).toBe('test-session');
    expect(parsed.trace_id).toBe('test-trace');
    expect(parsed.action).toBe('prescribe-medication');
    expect(parsed.action_state).toBe('system-blocked');
    expect(parsed.actor).toBe('agent');
    expect(parsed.target).toBe('patient-123');
    expect(parsed.outcome).toBe('denied');
    expect(parsed.details).toEqual({ medication: 'amoxicillin', dose: '500mg' });
    expect(parsed.blocked_reason).toBe('Outside scope of practice');
    expect(parsed.blocking_layer).toBe('hardening');
    expect(parsed.prev_hash).toBeNull();
  });

  it('multiple sequential writes maintain chain integrity', () => {
    const writer = new AuditWriter(logPath);
    for (let i = 0; i < 10; i++) {
      writer.append(makeEntry({ action: `sequential-${i}` }));
    }

    const result = writer.verifyChain();
    expect(result).toEqual({ valid: true, entries: 10 });

    // Verify each entry's prev_hash matches the hash of the previous line
    const lines = readFileSync(logPath, 'utf-8').trimEnd().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const entry: AuditEntry = JSON.parse(lines[i]);
      expect(entry.prev_hash).toBe(sha256(lines[i - 1]));
    }
  });
});
