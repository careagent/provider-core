/**
 * Tests for the review-edit-regenerate loop.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { createMockIO } from '../../../src/cli/io.js';
import { reviewLoop } from '../../../src/onboarding/review.js';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import { parseFrontmatter } from '../../../src/activation/cans-parser.js';
import { CANSSchema } from '../../../src/activation/cans-schema.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides?: Partial<CANSDocument>) {
  const data: CANSDocument = {
    ...(validCANSData as CANSDocument),
    ...(overrides ?? {}),
  };
  return {
    data,
    philosophy:
      'Evidence-based neurosurgical practice with emphasis on minimally invasive techniques and shared decision-making with patients.',
  };
}

function readCANS(workspacePath: string): string {
  return readFileSync(join(workspacePath, 'CANS.md'), 'utf-8');
}

// ---------------------------------------------------------------------------
// Test setup/teardown
// ---------------------------------------------------------------------------

let workspacePath: string;
let audit: AuditPipeline;

beforeEach(() => {
  workspacePath = mkdtempSync(join(tmpdir(), 'careagent-review-test-'));
  audit = new AuditPipeline(workspacePath, 'test-session-review');
});

afterEach(() => {
  rmSync(workspacePath, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Approve immediately
// ---------------------------------------------------------------------------

describe('reviewLoop — approve immediately', () => {
  it('writes CANS.md to workspace when provider selects 0 (approve)', async () => {
    // Response '0' → approve and save (index 0 in REVIEW_MENU_OPTIONS)
    const io = createMockIO(['0']);
    const result = makeResult();

    await reviewLoop(io, result, workspacePath, audit);

    expect(existsSync(join(workspacePath, 'CANS.md'))).toBe(true);
  });

  it('written CANS.md passes parseFrontmatter + Value.Check round-trip', async () => {
    const io = createMockIO(['0']);
    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    const parsed = parseFrontmatter(content);

    expect(parsed.error).toBeUndefined();
    expect(parsed.frontmatter).not.toBeNull();
    expect(Value.Check(CANSSchema, parsed.frontmatter)).toBe(true);
  });

  it('creates .careagent/cans-integrity.json (updateKnownGoodHash called)', async () => {
    const io = createMockIO(['0']);
    await reviewLoop(io, makeResult(), workspacePath, audit);

    const integrityPath = join(workspacePath, '.careagent', 'cans-integrity.json');
    expect(existsSync(integrityPath)).toBe(true);
  });

  it('creates .careagent/AUDIT.log with cans_generated event', async () => {
    const io = createMockIO(['0']);
    await reviewLoop(io, makeResult(), workspacePath, audit);

    const auditPath = join(workspacePath, '.careagent', 'AUDIT.log');
    expect(existsSync(auditPath)).toBe(true);

    const auditContent = readFileSync(auditPath, 'utf-8');
    expect(auditContent).toContain('cans_generated');
  });
});

// ---------------------------------------------------------------------------
// Edit provider and approve
// ---------------------------------------------------------------------------

describe('reviewLoop — edit provider then approve', () => {
  it('written CANS.md contains the new provider name after editing identity', async () => {
    // Choice 1 → edit identity
    // Then: new name, skip NPI
    // Then: choice 0 → approve
    const io = createMockIO([
      '1',             // select "Edit provider information"
      'Dr. New Name',  // new name
      '',              // skip NPI
      '0',             // approve
    ]);

    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    expect(content).toContain('Dr. New Name');
  });

  it('written CANS.md passes round-trip validation after provider edit', async () => {
    const io = createMockIO([
      '1',
      'Dr. Edited Provider',
      '',
      '0',
    ]);

    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    const parsed = parseFrontmatter(content);
    expect(parsed.error).toBeUndefined();
    expect(Value.Check(CANSSchema, parsed.frontmatter)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edit autonomy and approve
// ---------------------------------------------------------------------------

describe('reviewLoop — edit autonomy then approve', () => {
  it('written CANS.md reflects new autonomy tiers after editing', async () => {
    // Choice 7 → edit autonomy
    // Then: 4 autonomy tier selects (all manual = index 2)
    // Then: choice 0 → approve
    const io = createMockIO([
      '7',  // select "Edit autonomy tiers"
      '2',  // chart: manual
      '2',  // order: manual
      '2',  // charge: manual
      '2',  // perform: manual
      '0',  // approve
    ]);

    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    const parsed = parseFrontmatter(content);
    const frontmatter = parsed.frontmatter as CANSDocument;

    expect(frontmatter.autonomy.chart).toBe('manual');
    expect(frontmatter.autonomy.order).toBe('manual');
    expect(frontmatter.autonomy.charge).toBe('manual');
    expect(frontmatter.autonomy.perform).toBe('manual');
  });

  it('written CANS.md passes round-trip validation after autonomy edit', async () => {
    const io = createMockIO([
      '7',
      '0',  // autonomous
      '1',  // supervised
      '1',  // supervised
      '2',  // manual
      '0',
    ]);

    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    const parsed = parseFrontmatter(content);
    expect(Value.Check(CANSSchema, parsed.frontmatter)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Toggle hardening and approve
// ---------------------------------------------------------------------------

describe('reviewLoop — toggle hardening then approve', () => {
  it('written CANS.md reflects toggled hardening flag', async () => {
    // validCANSData.hardening.tool_policy_lockdown = true
    // After toggle: it should become false

    // Choice 8 → toggle hardening
    // Inner loop: select index 0 (tool_policy_lockdown) to toggle
    // Inner loop: select index 6 (Done) to exit
    // Choice 0 → approve
    const io = createMockIO([
      '8',  // select "Toggle hardening flags"
      '0',  // toggle flag at index 0 (tool_policy_lockdown)
      '6',  // Done (index 6 = 7th option = Done)
      '0',  // approve
    ]);

    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    const parsed = parseFrontmatter(content);
    const frontmatter = parsed.frontmatter as CANSDocument;

    // tool_policy_lockdown was true, now should be false after toggle
    expect(frontmatter.hardening.tool_policy_lockdown).toBe(false);
  });

  it('written CANS.md passes round-trip validation after hardening toggle', async () => {
    const io = createMockIO([
      '8',
      '0',  // toggle tool_policy_lockdown
      '6',  // Done
      '0',
    ]);

    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    const parsed = parseFrontmatter(content);
    expect(Value.Check(CANSSchema, parsed.frontmatter)).toBe(true);
  });

  it('toggling docker_sandbox flag changes its value', async () => {
    // validCANSData.hardening.docker_sandbox = false
    // docker_sandbox is at index 3 in the hardening object entries
    // Object.entries order: tool_policy_lockdown(0), exec_approval(1), cans_protocol_injection(2), docker_sandbox(3), safety_guard(4), audit_trail(5)
    const io = createMockIO([
      '8',  // toggle hardening
      '3',  // toggle docker_sandbox (index 3)
      '6',  // Done
      '0',  // approve
    ]);

    await reviewLoop(io, makeResult(), workspacePath, audit);

    const content = readCANS(workspacePath);
    const parsed = parseFrontmatter(content);
    const frontmatter = parsed.frontmatter as CANSDocument;

    // docker_sandbox was false, now should be true
    expect(frontmatter.hardening.docker_sandbox).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Audit and integrity guarantees
// ---------------------------------------------------------------------------

describe('reviewLoop — audit and integrity', () => {
  it('audit event contains provider name in details', async () => {
    const io = createMockIO(['0']);
    await reviewLoop(io, makeResult(), workspacePath, audit);

    const auditContent = readFileSync(join(workspacePath, '.careagent', 'AUDIT.log'), 'utf-8');
    expect(auditContent).toContain('Dr. Test Provider');
  });

  it('audit event contains specialty in details', async () => {
    const io = createMockIO(['0']);
    await reviewLoop(io, makeResult(), workspacePath, audit);

    const auditContent = readFileSync(join(workspacePath, '.careagent', 'AUDIT.log'), 'utf-8');
    expect(auditContent).toContain('Neurosurgery');
  });

  it('integrity hash file contains a hash field', async () => {
    const io = createMockIO(['0']);
    await reviewLoop(io, makeResult(), workspacePath, audit);

    const integrityPath = join(workspacePath, '.careagent', 'cans-integrity.json');
    const stored = JSON.parse(readFileSync(integrityPath, 'utf-8'));
    expect(stored).toHaveProperty('hash');
    expect(typeof stored.hash).toBe('string');
    expect(stored.hash.length).toBe(64); // SHA-256 hex
  });
});
