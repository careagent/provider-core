import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivationGate, type AuditCallback } from '../../../src/activation/gate.js';
import { computeHash } from '../../../src/activation/cans-integrity.js';

const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

describe('ActivationGate', () => {
  const tempDirs: string[] = [];

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'cans-gate-'));
    tempDirs.push(dir);
    return dir;
  }

  function createGate(workspace: string): { gate: ActivationGate; auditLog: AuditCallback; entries: Record<string, unknown>[] } {
    const entries: Record<string, unknown>[] = [];
    const auditLog: AuditCallback = (entry) => entries.push(entry);
    const gate = new ActivationGate(workspace, auditLog);
    return { gate, auditLog, entries };
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('returns { active: false } with "not found" when no CANS.md exists', () => {
    const workspace = createTempDir();
    const { gate } = createGate(workspace);

    const result = gate.check();
    expect(result.active).toBe(false);
    expect(result.document).toBeNull();
    expect(result.reason).toContain('CANS.md not found');
  });

  it('returns { active: true } with document for valid CANS.md', () => {
    const workspace = createTempDir();
    copyFileSync(join(FIXTURES_DIR, 'valid-cans.md'), join(workspace, 'CANS.md'));
    const { gate } = createGate(workspace);

    const result = gate.check();
    expect(result.active).toBe(true);
    expect(result.document).not.toBeNull();
    expect(result.document!.version).toBe('1.0');
    expect(result.document!.provider.name).toBe('Dr. Test Provider');
  });

  it('returns { active: false } with parse error for CANS.md without frontmatter', () => {
    const workspace = createTempDir();
    writeFileSync(join(workspace, 'CANS.md'), 'Just plain markdown, no frontmatter.');
    const { gate, entries } = createGate(workspace);

    const result = gate.check();
    expect(result.active).toBe(false);
    expect(result.document).toBeNull();
    expect(result.reason).toContain('missing opening ---');
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('cans_parse_error');
  });

  it('returns { active: false } with validation errors for malformed CANS.md', () => {
    const workspace = createTempDir();
    copyFileSync(join(FIXTURES_DIR, 'malformed-cans.md'), join(workspace, 'CANS.md'));
    const { gate, entries } = createGate(workspace);

    const result = gate.check();
    expect(result.active).toBe(false);
    expect(result.document).toBeNull();
    expect(result.reason).toContain('validation failed');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('cans_validation_error');
  });

  it('returns { active: false } with integrity reason when content is tampered after first load', () => {
    const workspace = createTempDir();
    const validContent = readFileSync(join(FIXTURES_DIR, 'valid-cans.md'), 'utf-8');

    // Write valid CANS.md and run first check to establish hash
    writeFileSync(join(workspace, 'CANS.md'), validContent);
    const { gate: gate1 } = createGate(workspace);
    const firstResult = gate1.check();
    expect(firstResult.active).toBe(true);

    // Now tamper with the file
    const tamperedContent = readFileSync(join(FIXTURES_DIR, 'tampered-cans.md'), 'utf-8');
    writeFileSync(join(workspace, 'CANS.md'), tamperedContent);

    const { gate: gate2, entries } = createGate(workspace);
    const result = gate2.check();
    expect(result.active).toBe(false);
    expect(result.document).toBeNull();
    expect(result.reason).toContain('SHA-256 hash mismatch');
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('cans_integrity_failure');
  });

  it('calls audit callback for each failure mode', () => {
    // Parse error
    const ws1 = createTempDir();
    writeFileSync(join(ws1, 'CANS.md'), 'no frontmatter');
    const { gate: g1, entries: e1 } = createGate(ws1);
    g1.check();
    expect(e1.length).toBe(1);
    expect(e1[0].action).toBe('cans_parse_error');

    // Validation error
    const ws2 = createTempDir();
    copyFileSync(join(FIXTURES_DIR, 'malformed-cans.md'), join(ws2, 'CANS.md'));
    const { gate: g2, entries: e2 } = createGate(ws2);
    g2.check();
    expect(e2.length).toBe(1);
    expect(e2[0].action).toBe('cans_validation_error');

    // Integrity error (tampered after first load)
    const ws3 = createTempDir();
    const validContent = readFileSync(join(FIXTURES_DIR, 'valid-cans.md'), 'utf-8');
    writeFileSync(join(ws3, 'CANS.md'), validContent);
    const { gate: g3a } = createGate(ws3);
    g3a.check(); // Establish hash
    const tamperedContent = readFileSync(join(FIXTURES_DIR, 'tampered-cans.md'), 'utf-8');
    writeFileSync(join(ws3, 'CANS.md'), tamperedContent);
    const { gate: g3b, entries: e3 } = createGate(ws3);
    g3b.check();
    expect(e3.length).toBe(1);
    expect(e3[0].action).toBe('cans_integrity_failure');
  });

  it('returns document with all typed fields accessible for valid CANS.md', () => {
    const workspace = createTempDir();
    copyFileSync(join(FIXTURES_DIR, 'valid-cans.md'), join(workspace, 'CANS.md'));
    const { gate } = createGate(workspace);

    const result = gate.check();
    expect(result.active).toBe(true);
    const doc = result.document!;

    // Provider fields
    expect(doc.provider.name).toBe('Dr. Test Provider');
    expect(doc.provider.npi).toBe('1234567890');
    expect(doc.provider.license.type).toBe('MD');
    expect(doc.provider.license.state).toBe('TX');
    expect(doc.provider.license.number).toBe('A12345');
    expect(doc.provider.license.verified).toBe(false);
    expect(doc.provider.specialty).toBe('Neurosurgery');
    expect(doc.provider.privileges).toEqual(['neurosurgical procedures', 'spine surgery']);

    // Scope fields
    expect(doc.scope.permitted_actions).toContain('chart_operative_note');
    expect(doc.scope.prohibited_actions).toContain('prescribe_controlled_substances');

    // Autonomy fields
    expect(doc.autonomy.chart).toBe('autonomous');
    expect(doc.autonomy.order).toBe('supervised');
    expect(doc.autonomy.perform).toBe('manual');

    // Hardening fields
    expect(doc.hardening.tool_policy_lockdown).toBe(true);
    expect(doc.hardening.audit_trail).toBe(true);

    // Consent fields
    expect(doc.consent.hipaa_warning_acknowledged).toBe(true);
    expect(doc.consent.synthetic_data_only).toBe(true);
  });
});
