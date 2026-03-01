/**
 * Tests for the CareAgent activate command.
 *
 * Uses mocked execSync to avoid actual OpenClaw CLI calls.
 * Tests both activation paths:
 * - Onboarding path (no CANS.md → writes BOOTSTRAP.md)
 * - Clinical path (CANS.md exists → full activation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
  const cansContent = `---\n${stringifyYAML(validCANSData)}---\n\n# Care Agent Nervous System\n\n## Provider Summary\n\nDr. Test Provider (Physician)\n\n## Clinical Philosophy\n\nEvidence-based neurosurgery\n\n## Autonomy Configuration\n`;
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
    // Also clean up clinical workspace (sibling dir)
    const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
    rmSync(clinicalPath, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Onboarding path tests (no CANS.md anywhere)
  // -------------------------------------------------------------------------

  describe('onboarding path (no CANS.md)', () => {
    it('creates clinical workspace and writes BOOTSTRAP.md', async () => {
      const result = await runActivateCommand(tmpDir, audit);
      expect(result.success).toBe(true);
      expect(result.onboarding).toBe(true);

      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      expect(existsSync(join(clinicalPath, 'BOOTSTRAP.md'))).toBe(true);
    });

    it('writes CANS-SCHEMA.md to clinical workspace', async () => {
      const result = await runActivateCommand(tmpDir, audit);
      expect(result.success).toBe(true);

      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      expect(existsSync(join(clinicalPath, 'CANS-SCHEMA.md'))).toBe(true);
    });

    it('creates the CareAgent agent', async () => {
      await runActivateCommand(tmpDir, audit);
      const addCalls = mockedExecSync.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('agents add'),
      );
      expect(addCalls.length).toBe(1);
      expect(String(addCalls[0][0])).toContain('careagent-provider');
    });

    it('binds Telegram to CareAgent agent', async () => {
      await runActivateCommand(tmpDir, audit);
      const bindCalls = mockedExecSync.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('agents bind'),
      );
      expect(bindCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('returns registered: false', async () => {
      const result = await runActivateCommand(tmpDir, audit);
      expect(result.registered).toBe(false);
    });

    it('BOOTSTRAP.md contains interview instructions', async () => {
      await runActivateCommand(tmpDir, audit);
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      const content = readFileSync(join(clinicalPath, 'BOOTSTRAP.md'), 'utf-8');
      expect(content).toContain('CareAgent Onboarding');
      expect(content).toContain('HIPAA');
      expect(content).toContain('autonomy');
    });

    it('includes Axon URL in BOOTSTRAP.md when AXON_URL is set', async () => {
      const original = process.env['AXON_URL'];
      process.env['AXON_URL'] = 'http://test-axon:9999';

      await runActivateCommand(tmpDir, audit);

      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      const content = readFileSync(join(clinicalPath, 'BOOTSTRAP.md'), 'utf-8');
      expect(content).toContain('http://test-axon:9999');

      if (original !== undefined) {
        process.env['AXON_URL'] = original;
      } else {
        delete process.env['AXON_URL'];
      }
    });
  });

  // -------------------------------------------------------------------------
  // Already in onboarding path
  // -------------------------------------------------------------------------

  describe('already in onboarding', () => {
    it('detects existing BOOTSTRAP.md and returns onboarding: true', async () => {
      // Create clinical workspace with BOOTSTRAP.md but no CANS.md
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeFileSync(join(clinicalPath, 'BOOTSTRAP.md'), '# Onboarding', 'utf-8');

      const result = await runActivateCommand(tmpDir, audit);
      expect(result.success).toBe(true);
      expect(result.onboarding).toBe(true);
    });

    it('does not create a new agent when already in onboarding', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeFileSync(join(clinicalPath, 'BOOTSTRAP.md'), '# Onboarding', 'utf-8');

      await runActivateCommand(tmpDir, audit);
      const addCalls = mockedExecSync.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('agents add'),
      );
      expect(addCalls.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Clinical path tests (CANS.md exists in clinical workspace)
  // -------------------------------------------------------------------------

  describe('clinical path (CANS.md in clinical workspace)', () => {
    it('activates clinical mode when CANS.md is in clinical workspace', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);

      const result = await runActivateCommand(tmpDir, audit);
      expect(result.success).toBe(true);
      expect(result.onboarding).toBeUndefined();
    });

    it('generates workspace files (SOUL.md, AGENTS.md, USER.md)', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);

      await runActivateCommand(tmpDir, audit);
      expect(existsSync(join(clinicalPath, 'SOUL.md'))).toBe(true);
      expect(existsSync(join(clinicalPath, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(clinicalPath, 'USER.md'))).toBe(true);
    });

    it('cleans up BOOTSTRAP.md after clinical activation', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);
      // Put bootstrap files there as if onboarding just completed
      writeFileSync(join(clinicalPath, 'BOOTSTRAP.md'), '# Onboarding', 'utf-8');
      writeFileSync(join(clinicalPath, 'CANS-SCHEMA.md'), '# Schema', 'utf-8');

      await runActivateCommand(tmpDir, audit);
      expect(existsSync(join(clinicalPath, 'BOOTSTRAP.md'))).toBe(false);
      expect(existsSync(join(clinicalPath, 'CANS-SCHEMA.md'))).toBe(false);
    });

    it('calls bind/unbind for telegram routing', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);

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

    it('returns error when CANS.md in clinical workspace is invalid', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeFileSync(join(clinicalPath, 'CANS.md'), 'no frontmatter');

      const result = await runActivateCommand(tmpDir, audit);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot activate');
    });

    it('extracts philosophy from CANS.md markdown body', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);

      await runActivateCommand(tmpDir, audit);

      // SOUL.md should contain the philosophy from the CANS.md body
      const soulContent = readFileSync(join(clinicalPath, 'SOUL.md'), 'utf-8');
      expect(soulContent).toContain('Evidence-based neurosurgery');
    });

    it('skips registration when NEURON_ENDPOINT is not set', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);

      const original = process.env['NEURON_ENDPOINT'];
      const originalUrl = process.env['NEURON_URL'];
      delete process.env['NEURON_ENDPOINT'];
      delete process.env['NEURON_URL'];

      const result = await runActivateCommand(tmpDir, audit);
      expect(result.success).toBe(true);
      expect(result.registered).toBe(false);

      if (original !== undefined) process.env['NEURON_ENDPOINT'] = original;
      if (originalUrl !== undefined) process.env['NEURON_URL'] = originalUrl;
    });

    it('passes model option through to agents add command', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);

      await runActivateCommand(tmpDir, audit, undefined, { model: 'claude-3-opus' });

      const addCalls = mockedExecSync.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('agents add'),
      );
      expect(addCalls.length).toBe(1);
      expect(String(addCalls[0][0])).toContain('--model claude-3-opus');
    });
  });

  // -------------------------------------------------------------------------
  // CANS.md in onboarding workspace (copy to clinical)
  // -------------------------------------------------------------------------

  describe('CANS.md in onboarding workspace', () => {
    it('copies CANS.md from onboarding to clinical workspace', async () => {
      writeValidCANS(tmpDir);

      const result = await runActivateCommand(tmpDir, audit);
      expect(result.success).toBe(true);

      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      expect(existsSync(join(clinicalPath, 'CANS.md'))).toBe(true);
    });

    it('copies integrity hash when copying CANS.md', async () => {
      writeValidCANS(tmpDir);

      await runActivateCommand(tmpDir, audit);

      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      expect(existsSync(join(clinicalPath, '.careagent', 'cans-integrity.json'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Audit logging
  // -------------------------------------------------------------------------

  describe('audit logging', () => {
    it('audit-logs onboarding activation', async () => {
      await runActivateCommand(tmpDir, audit);

      const auditLogPath = join(tmpDir, '.careagent', 'AUDIT.log');
      expect(existsSync(auditLogPath)).toBe(true);
      const auditContent = readFileSync(auditLogPath, 'utf-8');
      expect(auditContent).toContain('careagent_activate');
    });

    it('audit-logs clinical activation', async () => {
      const clinicalPath = resolve(tmpDir, '..', 'workspace-clinical');
      mkdirSync(clinicalPath, { recursive: true });
      writeValidCANS(clinicalPath);

      await runActivateCommand(tmpDir, audit);

      const auditLogPath = join(tmpDir, '.careagent', 'AUDIT.log');
      expect(existsSync(auditLogPath)).toBe(true);
      const auditContent = readFileSync(auditLogPath, 'utf-8');
      expect(auditContent).toContain('careagent_activate');
    });
  });
});
