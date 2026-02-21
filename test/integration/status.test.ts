/**
 * Integration tests for the careagent status command.
 *
 * Covers:
 * - ONBD-04: careagent status command output
 *
 * Uses temporary workspaces and formatStatus directly to verify output.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatStatus } from '../../src/cli/status-command.js';
import { createMockIO } from '../../src/cli/io.js';
import { runInitCommand } from '../../src/cli/init-command.js';
import { AuditPipeline } from '../../src/audit/pipeline.js';
import { completeInterviewResponses } from '../fixtures/interview-responses.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run init command to produce a fully activated workspace.
 */
async function initWorkspace(dir: string, responses = completeInterviewResponses): Promise<void> {
  const io = createMockIO([...responses]);
  const audit = new AuditPipeline(dir);
  await runInitCommand(io, dir, audit);
}

// ---------------------------------------------------------------------------
// ONBD-04: careagent status command
// ---------------------------------------------------------------------------

describe('ONBD-04: careagent status command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-status-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('status on empty workspace contains INACTIVE and N/A', () => {
    const output = formatStatus(tmpDir);
    expect(output).toContain('INACTIVE');
    expect(output).toContain('N/A');
  });

  it('status after init contains ACTIVE', async () => {
    await initWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('ACTIVE');
  });

  it('status after init contains provider name', async () => {
    await initWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Dr. Test Provider');
  });

  it('status after init contains specialty', async () => {
    await initWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Neurosurgery');
  });

  it('status after init contains autonomy tiers', async () => {
    await initWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Autonomy Tiers');
    expect(output).toContain('autonomous');
    expect(output).toContain('supervised');
    expect(output).toContain('manual');
  });

  it('status after init contains provider types and organization', async () => {
    await initWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Physician');
    expect(output).toContain('University Medical Center');
  });

  it('status after init contains audit stats', async () => {
    await initWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Audit Stats');
    expect(output).toContain('Total Entries');
    expect(output).toContain('Chain Valid');
  });

  it('status after init shows Verified for integrity', async () => {
    await initWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Verified');
  });

  it('status with malformed CANS.md contains INACTIVE', () => {
    // Write a malformed CANS.md (no frontmatter)
    writeFileSync(join(tmpDir, 'CANS.md'), 'This is not valid CANS content\n', 'utf-8');
    const output = formatStatus(tmpDir);
    expect(output).toContain('INACTIVE');
  });

  it('status header shows CareAgent Status title', () => {
    const output = formatStatus(tmpDir);
    expect(output).toContain('CareAgent Status');
  });

  it('status on empty workspace shows CANS.md not found reason', () => {
    const output = formatStatus(tmpDir);
    expect(output).toContain('CANS.md not found');
  });
});
