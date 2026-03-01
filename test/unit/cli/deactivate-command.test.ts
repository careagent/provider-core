/**
 * Tests for the CareAgent deactivate command.
 *
 * Uses mocked execSync to avoid actual OpenClaw CLI calls.
 * Tests the unbind/rebind orchestration logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditPipeline } from '../../../src/audit/pipeline.js';

// Mock child_process.execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
}));

import { runDeactivateCommand } from '../../../src/cli/deactivate-command.js';
import { execSync } from 'node:child_process';

const mockedExecSync = vi.mocked(execSync);

describe('runDeactivateCommand', () => {
  let tmpDir: string;
  let audit: AuditPipeline;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deactivate-cmd-'));
    audit = new AuditPipeline(tmpDir);
    mockedExecSync.mockReset();
    mockedExecSync.mockReturnValue('' as any);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns success on successful unbind/rebind', async () => {
    const result = await runDeactivateCommand(audit);
    expect(result.success).toBe(true);
  });

  it('calls unbind on careagent-provider for telegram', async () => {
    await runDeactivateCommand(audit);
    const unbindCalls = mockedExecSync.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('unbind') && c[0].includes('careagent-provider'),
    );
    expect(unbindCalls.length).toBe(1);
    expect(String(unbindCalls[0][0])).toContain('telegram');
  });

  it('calls bind on default agent for telegram', async () => {
    await runDeactivateCommand(audit);
    const bindCalls = mockedExecSync.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('bind') && c[0].includes('default'),
    );
    expect(bindCalls.length).toBe(1);
    expect(String(bindCalls[0][0])).toContain('telegram');
  });

  it('returns error when unbind fails', async () => {
    mockedExecSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr.includes('unbind')) {
        throw new Error('unbind failed');
      }
      return '' as any;
    });

    const result = await runDeactivateCommand(audit);
    expect(result.success).toBe(false);
    expect(result.error).toContain('unbind');
  });

  it('returns error when rebind to default fails', async () => {
    mockedExecSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr.includes('bind') && cmdStr.includes('default')) {
        throw new Error('rebind failed');
      }
      return '' as any;
    });

    const result = await runDeactivateCommand(audit);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rebind');
  });

  it('audit-logs the deactivation', async () => {
    await runDeactivateCommand(audit);
    const auditLogPath = join(tmpDir, '.careagent', 'AUDIT.log');
    expect(existsSync(auditLogPath)).toBe(true);
    const auditContent = readFileSync(auditLogPath, 'utf-8');
    expect(auditContent).toContain('careagent_deactivate');
  });

  it('executes unbind before bind (correct order)', async () => {
    const callOrder: string[] = [];
    mockedExecSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr.includes('unbind')) callOrder.push('unbind');
      if (cmdStr.includes('bind') && !cmdStr.includes('unbind')) callOrder.push('bind');
      return '' as any;
    });

    await runDeactivateCommand(audit);
    expect(callOrder[0]).toBe('unbind');
    expect(callOrder[1]).toBe('bind');
  });
});
