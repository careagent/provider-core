/**
 * Tests for the CareAgent activate command.
 *
 * Uses mocked execSync to avoid actual OpenClaw CLI calls.
 * Tests the orchestration logic: gate check, workspace copy,
 * file supplementation, binding, and registration skipping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import { stringifyYAML } from '../../../src/vendor/yaml/index.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';
import { updateKnownGoodHash } from '../../../src/activation/cans-integrity.js';

// Mock child_process.execSync to prevent actual shell calls
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => '[]'),
}));

import { runActivateCommand } from '../../../src/cli/activate-command.js';
import { execSync } from 'node:child_process';

const mockedExecSync = vi.mocked(execSync);

function writeValidCANS(dir: string): void {
  const cansContent = `---\n${stringifyYAML(validCANSData)}---\n\n# CANS\n`;
  writeFileSync(join(dir, 'CANS.md'), cansContent);
  updateKnownGoodHash(dir, cansContent);
}

describe('runActivateCommand', () => {
  let tmpDir: string;
  let audit: AuditPipeline;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'activate-cmd-'));
    audit = new AuditPipeline(tmpDir);
    mockedExecSync.mockReset();
    // Default: agents list returns empty, all other commands succeed
    mockedExecSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr.includes('agents list')) return '[]';
      return '';
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns error when CANS.md does not exist', async () => {
    const result = await runActivateCommand(tmpDir, audit);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot activate');
  });

  it('returns error when CANS.md is invalid', async () => {
    writeFileSync(join(tmpDir, 'CANS.md'), 'no frontmatter');
    const result = await runActivateCommand(tmpDir, audit);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot activate');
  });

  it('creates clinical workspace directory on valid CANS.md', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit);
    const clinicalPath = join(tmpDir, '..', 'workspace-clinical');
    expect(existsSync(clinicalPath)).toBe(true);
  });

  it('copies CANS.md to clinical workspace', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit);
    const clinicalPath = join(tmpDir, '..', 'workspace-clinical');
    expect(existsSync(join(clinicalPath, 'CANS.md'))).toBe(true);
    // Content should match source
    const source = readFileSync(join(tmpDir, 'CANS.md'), 'utf-8');
    const dest = readFileSync(join(clinicalPath, 'CANS.md'), 'utf-8');
    expect(dest).toBe(source);
  });

  it('copies integrity hash to clinical workspace', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit);
    const clinicalPath = join(tmpDir, '..', 'workspace-clinical');
    expect(existsSync(join(clinicalPath, '.careagent', 'cans-integrity.json'))).toBe(true);
  });

  it('generates workspace files in clinical workspace', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit);
    const clinicalPath = join(tmpDir, '..', 'workspace-clinical');
    expect(existsSync(join(clinicalPath, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(clinicalPath, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(clinicalPath, 'USER.md'))).toBe(true);
  });

  it('calls openclaw agents add when agent does not exist', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit);
    const addCalls = mockedExecSync.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('agents add'),
    );
    expect(addCalls.length).toBe(1);
    expect(String(addCalls[0][0])).toContain('careagent-provider');
  });

  it('skips agent creation when agent already exists', async () => {
    writeValidCANS(tmpDir);
    mockedExecSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr.includes('agents list')) {
        return JSON.stringify([{ id: 'careagent-provider', name: 'careagent-provider' }]);
      }
      return '';
    });

    await runActivateCommand(tmpDir, audit);
    const addCalls = mockedExecSync.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('agents add'),
    );
    expect(addCalls.length).toBe(0);
  });

  it('calls bind/unbind for telegram routing', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit);

    const bindCalls = mockedExecSync.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('agents bind'),
    );
    const unbindCalls = mockedExecSync.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('agents unbind'),
    );

    expect(bindCalls.length).toBeGreaterThanOrEqual(1);
    expect(unbindCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns success true on valid CANS.md', async () => {
    writeValidCANS(tmpDir);
    const result = await runActivateCommand(tmpDir, audit);
    expect(result.success).toBe(true);
    expect(result.clinicalWorkspacePath).toBeDefined();
  });

  it('skips registration when NEURON_ENDPOINT is not set', async () => {
    writeValidCANS(tmpDir);
    const original = process.env['NEURON_ENDPOINT'];
    delete process.env['NEURON_ENDPOINT'];
    delete process.env['NEURON_URL'];

    const result = await runActivateCommand(tmpDir, audit);
    expect(result.success).toBe(true);
    // registered should be false since no neuron endpoint
    expect(result.registered).toBe(false);

    if (original !== undefined) {
      process.env['NEURON_ENDPOINT'] = original;
    }
  });

  it('passes model option through to agents add command', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit, undefined, { model: 'claude-3-opus' });

    const addCalls = mockedExecSync.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('agents add'),
    );
    expect(addCalls.length).toBe(1);
    expect(String(addCalls[0][0])).toContain('--model claude-3-opus');
  });

  it('audit-logs the activation', async () => {
    writeValidCANS(tmpDir);
    await runActivateCommand(tmpDir, audit);

    // Read the audit log and check for activation entry
    const auditLogPath = join(tmpDir, '.careagent', 'AUDIT.log');
    expect(existsSync(auditLogPath)).toBe(true);
    const auditContent = readFileSync(auditLogPath, 'utf-8');
    expect(auditContent).toContain('careagent_activate');
  });
});
