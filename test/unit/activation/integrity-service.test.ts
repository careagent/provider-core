/**
 * Tests for the CANS.md integrity background service.
 *
 * Mirrors the test patterns from test/unit/audit/integrity-service.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import { createCansIntegrityService } from '../../../src/activation/integrity-service.js';
import { updateKnownGoodHash, computeHash } from '../../../src/activation/cans-integrity.js';
import { stringifyYAML } from '../../../src/vendor/yaml/index.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';

function writeValidCANS(dir: string): string {
  const content = `---\n${stringifyYAML(validCANSData)}---\n\n# CANS\n`;
  writeFileSync(join(dir, 'CANS.md'), content);
  updateKnownGoodHash(dir, content);
  return content;
}

describe('createCansIntegrityService', () => {
  let tmpDir: string;
  let audit: AuditPipeline;
  let logMessages: Array<{ level: string; message: string; data?: unknown }>;
  let adapter: { log: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void };

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = mkdtempSync(join(tmpdir(), 'cans-integrity-svc-'));
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
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    expect(service.id).toBe('careagent-cans-integrity');
    expect(typeof service.start).toBe('function');
    expect(typeof service.stop).toBe('function');
  });

  it('start() logs startup message', () => {
    writeValidCANS(tmpDir);
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    service.start();

    const startMsg = logMessages.find((m) => m.message.includes('CANS.md integrity service started'));
    expect(startMsg).toBeDefined();
    expect(startMsg!.level).toBe('info');
  });

  it('start() passes initial check with valid CANS.md', () => {
    writeValidCANS(tmpDir);
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    service.start();

    const errorMsg = logMessages.find((m) => m.level === 'error');
    expect(errorMsg).toBeUndefined();
  });

  it('start() detects missing CANS.md on startup', () => {
    // No CANS.md written
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    service.start();

    const errorMsg = logMessages.find((m) => m.level === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.message).toContain('CANS.md missing');
  });

  it('periodic check detects tampered CANS.md', () => {
    writeValidCANS(tmpDir);
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    service.start();

    // Tamper with CANS.md
    writeFileSync(join(tmpDir, 'CANS.md'), 'tampered content');

    // Clear previous messages to isolate periodic check
    logMessages.length = 0;

    // Advance timer to trigger periodic check
    vi.advanceTimersByTime(60_000);

    const errorMsg = logMessages.find((m) => m.level === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.message).toContain('integrity failure');
  });

  it('periodic check passes with unmodified CANS.md', () => {
    writeValidCANS(tmpDir);
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    service.start();

    logMessages.length = 0;
    vi.advanceTimersByTime(60_000);

    const errorMsg = logMessages.find((m) => m.level === 'error');
    expect(errorMsg).toBeUndefined();
  });

  it('stop() clears the interval', () => {
    writeValidCANS(tmpDir);
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    service.start();
    service.stop!();

    const stopMsg = logMessages.find((m) => m.message.includes('CANS.md integrity service stopped'));
    expect(stopMsg).toBeDefined();

    // Tamper after stop — should not detect
    writeFileSync(join(tmpDir, 'CANS.md'), 'tampered after stop');
    logMessages.length = 0;
    vi.advanceTimersByTime(120_000);

    const errorAfterStop = logMessages.find((m) => m.level === 'error');
    expect(errorAfterStop).toBeUndefined();
  });

  it('detects CANS.md deletion during periodic check', () => {
    writeValidCANS(tmpDir);
    const service = createCansIntegrityService(tmpDir, audit, adapter);
    service.start();

    // Delete CANS.md
    const { unlinkSync } = require('node:fs');
    unlinkSync(join(tmpDir, 'CANS.md'));

    logMessages.length = 0;
    vi.advanceTimersByTime(60_000);

    const errorMsg = logMessages.find((m) => m.level === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.message).toContain('CANS.md missing');
  });
});
