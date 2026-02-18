import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import { createAuditIntegrityService } from '../../../src/audit/integrity-service.js';

describe('createAuditIntegrityService', () => {
  let tmpDir: string;
  let audit: AuditPipeline;
  let logMessages: Array<{ level: string; message: string; data?: unknown }>;
  let adapter: { log: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void };

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = mkdtempSync(join(tmpdir(), 'integrity-svc-'));
    audit = new AuditPipeline(tmpDir);
    logMessages = [];
    adapter = {
      log: (level, message, data) => {
        logMessages.push({ level, message, data });
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a ServiceConfig with id, start, and stop', () => {
    const service = createAuditIntegrityService(audit, adapter);

    expect(service.id).toBe('careagent-audit-integrity');
    expect(typeof service.start).toBe('function');
    expect(typeof service.stop).toBe('function');
  });

  it('uses the correct service ID', () => {
    const service = createAuditIntegrityService(audit, adapter);
    expect(service.id).toBe('careagent-audit-integrity');
  });

  it('start() runs initial integrity check and logs startup', () => {
    const service = createAuditIntegrityService(audit, adapter);
    service.start();

    const startMsg = logMessages.find(m => m.message.includes('Audit integrity service started'));
    expect(startMsg).toBeDefined();
    expect(startMsg!.level).toBe('info');
  });

  it('start() detects broken chain on startup and logs error', () => {
    // Write a valid entry, then manually corrupt the audit log
    audit.log({
      action: 'test_action',
      actor: 'system',
      outcome: 'allowed',
    });

    // Corrupt the audit log by writing invalid JSON
    const { writeFileSync } = require('node:fs');
    const logPath = join(tmpDir, '.careagent', 'AUDIT.log');
    writeFileSync(logPath, '{"corrupted": true, "prev_hash": "wrong_hash"}\n');

    // Create a fresh pipeline that reads the corrupted file
    const freshAudit = new AuditPipeline(tmpDir);
    const service = createAuditIntegrityService(freshAudit, adapter);
    service.start();

    const errorMsg = logMessages.find(m => m.level === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.message).toContain('integrity failure on startup');
  });

  it('periodic check detects broken chain and logs error', () => {
    // Write two entries so tampering with the first breaks the chain
    audit.log({
      action: 'first_action',
      actor: 'system',
      outcome: 'allowed',
    });
    audit.log({
      action: 'second_action',
      actor: 'system',
      outcome: 'allowed',
    });

    const service = createAuditIntegrityService(audit, adapter);
    service.start();

    // Corrupt the audit log — tamper with the first entry so entry 2's prev_hash is wrong
    const { writeFileSync, readFileSync } = require('node:fs');
    const logPath = join(tmpDir, '.careagent', 'AUDIT.log');
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    const parsed = JSON.parse(lines[0]);
    parsed.action = 'tampered_action';
    lines[0] = JSON.stringify(parsed);
    writeFileSync(logPath, lines.join('\n') + '\n');

    // Clear previous messages to isolate periodic check
    logMessages.length = 0;

    // Advance timer to trigger periodic check
    vi.advanceTimersByTime(60_000);

    const errorMsg = logMessages.find(m => m.level === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.message).toContain('integrity failure');
  });

  it('stop() clears the interval', () => {
    const service = createAuditIntegrityService(audit, adapter);
    service.start();

    // Write a valid entry
    audit.log({
      action: 'test_action',
      actor: 'system',
      outcome: 'allowed',
    });

    service.stop!();

    const stopMsg = logMessages.find(m => m.message.includes('Audit integrity service stopped'));
    expect(stopMsg).toBeDefined();

    // Clear messages and advance timer - should NOT trigger any more checks
    logMessages.length = 0;
    vi.advanceTimersByTime(120_000);

    const errorAfterStop = logMessages.find(m => m.level === 'error');
    expect(errorAfterStop).toBeUndefined();
  });

  it('valid chain does not log errors', () => {
    audit.log({
      action: 'test_action',
      actor: 'system',
      outcome: 'allowed',
    });

    const service = createAuditIntegrityService(audit, adapter);
    service.start();

    const errorMsg = logMessages.find(m => m.level === 'error');
    expect(errorMsg).toBeUndefined();

    // Advance and check periodic too
    vi.advanceTimersByTime(60_000);
    const periodicError = logMessages.find(m => m.level === 'error');
    expect(periodicError).toBeUndefined();
  });
});
