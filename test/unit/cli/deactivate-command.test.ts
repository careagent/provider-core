/**
 * Tests for the CareAgent deactivate command.
 *
 * With the config-manager refactor, the deactivate command no longer
 * uses execSync for CLI calls. Peer-level binding removal is handled
 * by the slash command handler in openclaw.ts (which has access to
 * senderId). This command handles audit logging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditPipeline } from '../../../src/audit/pipeline.js';

import { runDeactivateCommand } from '../../../src/cli/deactivate-command.js';

describe('runDeactivateCommand', () => {
  let tmpDir: string;
  let audit: AuditPipeline;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deactivate-cmd-'));
    audit = new AuditPipeline(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns success', async () => {
    const result = await runDeactivateCommand(audit);
    expect(result.success).toBe(true);
  });

  it('audit-logs the deactivation', async () => {
    await runDeactivateCommand(audit);
    const auditLogPath = join(tmpDir, '.careagent', 'AUDIT.log');
    expect(existsSync(auditLogPath)).toBe(true);
    const auditContent = readFileSync(auditLogPath, 'utf-8');
    expect(auditContent).toContain('careagent_deactivate');
  });

  it('includes agent_id in audit log', async () => {
    await runDeactivateCommand(audit);
    const auditLogPath = join(tmpDir, '.careagent', 'AUDIT.log');
    const auditContent = readFileSync(auditLogPath, 'utf-8');
    expect(auditContent).toContain('careagent-provider');
  });
});
