/**
 * Tests for careagent status command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringifyYAML } from '../../../src/vendor/yaml/index.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';
import { updateKnownGoodHash } from '../../../src/activation/cans-integrity.js';
import { readAuditStats, formatStatus } from '../../../src/cli/status-command.js';
import { AuditPipeline } from '../../../src/audit/pipeline.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'status-cmd-test-'));
}

function writeValidCANS(dir: string): string {
  const cansContent = `---\n${stringifyYAML(validCANSData)}---\n\n# CANS\n`;
  writeFileSync(join(dir, 'CANS.md'), cansContent);
  updateKnownGoodHash(dir, cansContent);
  return cansContent;
}

describe('readAuditStats', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero stats when no AUDIT.log exists', () => {
    const stats = readAuditStats(tmpDir);
    expect(stats.totalEntries).toBe(0);
    expect(stats.chainValid).toBe(true);
    expect(stats.lastTimestamp).toBeNull();
  });

  it('returns zero stats when AUDIT.log is empty', () => {
    mkdirSync(join(tmpDir, '.careagent'), { recursive: true });
    writeFileSync(join(tmpDir, '.careagent', 'AUDIT.log'), '');
    const stats = readAuditStats(tmpDir);
    expect(stats.totalEntries).toBe(0);
    expect(stats.chainValid).toBe(true);
    expect(stats.lastTimestamp).toBeNull();
  });

  it('returns correct count and last timestamp when entries exist', () => {
    const pipeline = new AuditPipeline(tmpDir);
    pipeline.log({ action: 'test_action_1', outcome: 'allowed' });
    pipeline.log({ action: 'test_action_2', outcome: 'allowed' });
    pipeline.log({ action: 'test_action_3', outcome: 'allowed' });

    const stats = readAuditStats(tmpDir);
    expect(stats.totalEntries).toBe(3);
    expect(stats.chainValid).toBe(true);
    expect(stats.lastTimestamp).not.toBeNull();
    expect(typeof stats.lastTimestamp).toBe('string');
    expect(new Date(stats.lastTimestamp!).getTime()).toBeGreaterThan(0);
  });

  it('returns chainValid: true for a valid chain', () => {
    const pipeline = new AuditPipeline(tmpDir);
    pipeline.log({ action: 'activation_check', outcome: 'active' });

    const stats = readAuditStats(tmpDir);
    expect(stats.chainValid).toBe(true);
    expect(stats.chainError).toBeUndefined();
  });
});

describe('formatStatus', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('contains "CareAgent Status" header', () => {
    const output = formatStatus(tmpDir);
    expect(output).toContain('CareAgent Status');
  });

  it('shows INACTIVE when no CANS.md exists (empty workspace)', () => {
    const output = formatStatus(tmpDir);
    expect(output).toContain('INACTIVE');
    // Check specifically for the mode line — not just substring match
    expect(output).toContain('Clinical Mode:    INACTIVE');
    expect(output).not.toContain('Clinical Mode:    ACTIVE');
  });

  it('shows N/A for Last Entry when no audit entries', () => {
    const output = formatStatus(tmpDir);
    expect(output).toContain('Last Entry:     N/A');
  });

  it('shows "No CANS.md" when no CANS.md exists (no integrity file either)', () => {
    // Empty workspace: no CANS.md and no integrity store
    const output = formatStatus(tmpDir);
    expect(output).toContain('No CANS.md');
  });

  it('shows "No hash stored" when CANS.md exists but store not yet seeded (invalid CANS bypasses integrity step)', () => {
    // When CANS.md is malformed, gate.check() fails at parse/validation before reaching
    // the integrity step, so the integrity store is never created.
    // checkIntegrity sees: CANS.md exists, store does not -> "No hash stored"
    writeFileSync(join(tmpDir, 'CANS.md'), '---\nversion: "2.0"\n---\n# incomplete CANS\n');
    const output = formatStatus(tmpDir);
    expect(output).toContain('No hash stored');
  });

  it('shows "No CANS.md" in integrity section when CANS.md does not exist but integrity store does', () => {
    // Edge case: integrity store exists but CANS.md was deleted
    mkdirSync(join(tmpDir, '.careagent'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.careagent', 'cans-integrity.json'),
      JSON.stringify({ hash: 'fakehash', timestamp: new Date().toISOString() }),
    );
    const output = formatStatus(tmpDir);
    expect(output).toContain('No CANS.md');
  });

  it('shows INACTIVE with reason for malformed CANS.md', () => {
    writeFileSync(join(tmpDir, 'CANS.md'), 'no frontmatter here');
    const output = formatStatus(tmpDir);
    expect(output).toContain('INACTIVE');
    expect(output).toContain('Reason:');
  });

  it('shows ACTIVE with provider info for valid CANS.md', () => {
    writeValidCANS(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Clinical Mode:    ACTIVE');
    expect(output).toContain('Dr. Test Provider');
    expect(output).toContain('Neurosurgery');
  });

  it('shows types and organization for active workspace', () => {
    writeValidCANS(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Physician');
    expect(output).toContain('University Medical Center');
  });

  it('shows subspecialty for active workspace', () => {
    writeValidCANS(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Spine');
  });

  it('contains all seven autonomy tier labels for active workspace', () => {
    writeValidCANS(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Chart:');
    expect(output).toContain('Order:');
    expect(output).toContain('Charge:');
    expect(output).toContain('Perform:');
    expect(output).toContain('Interpret:');
    expect(output).toContain('Educate:');
    expect(output).toContain('Coordinate:');
  });

  it('shows correct autonomy tier values for active workspace', () => {
    writeValidCANS(tmpDir);
    const output = formatStatus(tmpDir);
    // validCANSData has chart:autonomous, order:supervised, charge:supervised,
    // perform:manual, interpret:manual, educate:manual, coordinate:manual
    expect(output).toContain('Chart:          autonomous');
    expect(output).toContain('Order:          supervised');
    expect(output).toContain('Charge:         supervised');
    expect(output).toContain('Perform:        manual');
    expect(output).toContain('Interpret:      manual');
    expect(output).toContain('Educate:        manual');
    expect(output).toContain('Coordinate:     manual');
  });

  it('shows hardening is always on (deterministic)', () => {
    writeValidCANS(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Hardening: always on (deterministic)');
  });

  it('shows "Verified" in integrity section when hash matches', () => {
    writeValidCANS(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('CANS.md Hash:   Verified');
  });

  it('shows total entries count in audit stats', () => {
    writeValidCANS(tmpDir);
    const pipeline = new AuditPipeline(tmpDir);
    pipeline.log({ action: 'test', outcome: 'allowed' });
    pipeline.log({ action: 'test2', outcome: 'allowed' });

    const output = formatStatus(tmpDir);
    expect(output).toContain('Total Entries:  2');
  });

  it('shows chain valid Yes for valid chain', () => {
    writeValidCANS(tmpDir);
    const pipeline = new AuditPipeline(tmpDir);
    pipeline.log({ action: 'test', outcome: 'allowed' });

    const output = formatStatus(tmpDir);
    expect(output).toContain('Chain Valid:    Yes');
  });

  it('shows last timestamp for audit entries', () => {
    writeValidCANS(tmpDir);
    const pipeline = new AuditPipeline(tmpDir);
    pipeline.log({ action: 'test', outcome: 'allowed' });

    const output = formatStatus(tmpDir);
    // Should NOT contain N/A in the audit stats section since there are entries
    const auditSection = output.slice(output.indexOf('Audit Stats:'));
    expect(auditSection).not.toContain('N/A');
  });
});
