/**
 * Integration tests for the Activation Gate subsystem.
 *
 * Verifies end-to-end behavior using temporary workspaces with real files:
 * - CANS-01: Presence-based activation
 * - CANS-02 through CANS-05: Schema field coverage
 * - CANS-06: Schema validation
 * - CANS-07: Integrity checking
 * - Audit callbacks on failure modes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ActivationGate, type AuditCallback } from '../../src/activation/gate.js';
import { updateKnownGoodHash } from '../../src/activation/cans-integrity.js';
import { validCANSData } from '../fixtures/valid-cans-data.js';
import { stringifyYAML } from '../../src/vendor/yaml/index.js';

/**
 * Create a CANS.md file from structured data.
 */
function createCANSFile(dir: string, data: Record<string, unknown>): void {
  const yaml = stringifyYAML(data);
  writeFileSync(join(dir, 'CANS.md'), `---\n${yaml}---\n\n# Care Agent Nervous System\n`);
}

/**
 * Read the CANS.md file content from a directory.
 */
function readCANSFile(dir: string): string {
  return readFileSync(join(dir, 'CANS.md'), 'utf-8');
}

describe('Activation Gate Integration', () => {
  let tmpDir: string;
  let auditEntries: Array<Record<string, unknown>>;
  let auditCallback: AuditCallback;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-activation-'));
    auditEntries = [];
    auditCallback = (entry) => auditEntries.push(entry);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // CANS-01: Presence-based activation
  // ---------------------------------------------------------------------------

  describe('CANS-01: Presence-based activation', () => {
    it('returns inactive when workspace has no CANS.md', () => {
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(false);
      expect(result.document).toBeNull();
      expect(result.reason).toContain('not found');
    });

    it('returns active when workspace has valid CANS.md', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(true);
      expect(result.document).not.toBeNull();
      expect(result.document!.provider.name).toBe('Dr. Test Provider');
    });

    it('returns inactive after CANS.md is removed', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);

      // First check: active
      const first = gate.check();
      expect(first.active).toBe(true);

      // Remove CANS.md
      unlinkSync(join(tmpDir, 'CANS.md'));

      // Second check: inactive (new gate instance to avoid cached integrity store)
      const gate2 = new ActivationGate(tmpDir, auditCallback);
      const second = gate2.check();
      expect(second.active).toBe(false);
      expect(second.document).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // CANS-06: Schema validation
  // ---------------------------------------------------------------------------

  describe('CANS-06: Schema validation', () => {
    it('passes validation for complete valid CANS.md', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.document).not.toBeNull();

      // All typed fields present
      expect(typeof result.document!.version).toBe('string');
      expect(typeof result.document!.provider.name).toBe('string');
      expect(typeof result.document!.autonomy.chart).toBe('string');
      expect(typeof result.document!.hardening.tool_policy_lockdown).toBe('boolean');
      expect(typeof result.document!.consent.hipaa_warning_acknowledged).toBe('boolean');
    });

    it('rejects CANS.md with missing required field (no provider.license)', () => {
      const invalid = JSON.parse(JSON.stringify(validCANSData));
      delete invalid.provider.license;

      createCANSFile(tmpDir, invalid);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      // Error path should reference the missing field
      const paths = result.errors!.map(e => e.path);
      expect(paths.some(p => p.includes('provider') || p.includes('license'))).toBe(true);
    });

    it('rejects CANS.md with wrong type (autonomy.chart as non-literal)', () => {
      const invalid = JSON.parse(JSON.stringify(validCANSData));
      invalid.autonomy.chart = 'auto'; // not in union

      createCANSFile(tmpDir, invalid);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.path.includes('autonomy'))).toBe(true);
    });

    it('rejects CANS.md with empty frontmatter', () => {
      writeFileSync(join(tmpDir, 'CANS.md'), '---\n---\n\n# Empty');
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('rejects CANS.md without --- delimiters', () => {
      writeFileSync(join(tmpDir, 'CANS.md'), 'just some content\nno frontmatter here\n');
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(false);
      expect(result.reason).toContain('---');
    });
  });

  // ---------------------------------------------------------------------------
  // CANS-02 through CANS-05: Schema fields
  // ---------------------------------------------------------------------------

  describe('CANS-02 through CANS-05: Schema fields', () => {
    it('CANS-02: document has provider identity fields', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(true);
      const doc = result.document!;
      expect(doc.provider.name).toBe('Dr. Test Provider');
      expect(doc.provider.npi).toBe('1234567890');
      expect(doc.provider.license.type).toBe('MD');
      expect(doc.provider.license.state).toBe('TX');
      expect(doc.provider.license.number).toBe('A12345');
      expect(doc.provider.license.verified).toBe(false);
      expect(doc.provider.specialty).toBe('Neurosurgery');
      expect(doc.provider.institution).toBe('University Medical Center');
      expect(doc.provider.privileges).toEqual(['neurosurgical procedures', 'spine surgery']);
    });

    it('CANS-03: document has scope of practice fields', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(true);
      const doc = result.document!;
      expect(doc.scope.permitted_actions).toContain('chart_operative_note');
      expect(doc.scope.prohibited_actions).toContain('prescribe_controlled_substances');
    });

    it('CANS-04: document has autonomy tier fields', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(true);
      const doc = result.document!;
      expect(doc.autonomy.chart).toBe('autonomous');
      expect(doc.autonomy.order).toBe('supervised');
      expect(doc.autonomy.charge).toBe('supervised');
      expect(doc.autonomy.perform).toBe('manual');
    });

    it('CANS-05: document has hardening flags and consent config', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(true);
      const doc = result.document!;

      // Hardening
      expect(doc.hardening.tool_policy_lockdown).toBe(true);
      expect(doc.hardening.exec_approval).toBe(true);
      expect(doc.hardening.cans_protocol_injection).toBe(true);
      expect(doc.hardening.docker_sandbox).toBe(false);
      expect(doc.hardening.safety_guard).toBe(true);
      expect(doc.hardening.audit_trail).toBe(true);

      // Consent
      expect(doc.consent.hipaa_warning_acknowledged).toBe(true);
      expect(doc.consent.synthetic_data_only).toBe(true);
      expect(doc.consent.audit_consent).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // CANS-07: Integrity checking
  // ---------------------------------------------------------------------------

  describe('CANS-07: Integrity checking', () => {
    it('first load stores hash and returns valid', () => {
      createCANSFile(tmpDir, validCANSData);
      const gate = new ActivationGate(tmpDir, auditCallback);
      const result = gate.check();

      expect(result.active).toBe(true);
      expect(result.document).not.toBeNull();
    });

    it('second load with same content validates correctly', () => {
      createCANSFile(tmpDir, validCANSData);

      // First load
      const gate1 = new ActivationGate(tmpDir, auditCallback);
      const first = gate1.check();
      expect(first.active).toBe(true);

      // Second load (same content)
      const gate2 = new ActivationGate(tmpDir, auditCallback);
      const second = gate2.check();
      expect(second.active).toBe(true);
    });

    it('second load with modified content fails integrity', () => {
      createCANSFile(tmpDir, validCANSData);

      // First load
      const gate1 = new ActivationGate(tmpDir, auditCallback);
      gate1.check();

      // Modify CANS.md
      const modified = { ...validCANSData, provider: { ...validCANSData.provider, name: 'Dr. Hacker' } };
      createCANSFile(tmpDir, modified);

      // Second load should fail integrity
      const gate2 = new ActivationGate(tmpDir, auditCallback);
      const result = gate2.check();
      expect(result.active).toBe(false);
      expect(result.reason).toContain('hash mismatch');
    });

    it('updateKnownGoodHash allows modified content to validate', () => {
      createCANSFile(tmpDir, validCANSData);

      // First load
      const gate1 = new ActivationGate(tmpDir, auditCallback);
      gate1.check();

      // Modify CANS.md
      const modified = { ...validCANSData, provider: { ...validCANSData.provider, name: 'Dr. Updated' } };
      createCANSFile(tmpDir, modified);

      // Update known good hash
      const newContent = readCANSFile(tmpDir);
      updateKnownGoodHash(tmpDir, newContent);

      // Now it should validate
      const gate2 = new ActivationGate(tmpDir, auditCallback);
      const result = gate2.check();
      expect(result.active).toBe(true);
      expect(result.document!.provider.name).toBe('Dr. Updated');
    });
  });

  // ---------------------------------------------------------------------------
  // Audit callbacks on failure modes
  // ---------------------------------------------------------------------------

  describe('Audit callbacks on failure modes', () => {
    it('triggers audit callback on parse error', () => {
      writeFileSync(join(tmpDir, 'CANS.md'), 'no frontmatter');
      const gate = new ActivationGate(tmpDir, auditCallback);
      gate.check();

      expect(auditEntries.length).toBeGreaterThan(0);
      expect(auditEntries.some(e => e.action === 'cans_parse_error')).toBe(true);
    });

    it('triggers audit callback on validation error', () => {
      // Valid frontmatter structure but missing required fields
      createCANSFile(tmpDir, { version: '1.0', provider: { name: 'Test' } });
      const gate = new ActivationGate(tmpDir, auditCallback);
      gate.check();

      expect(auditEntries.some(e => e.action === 'cans_validation_error')).toBe(true);
    });

    it('triggers audit callback on integrity failure', () => {
      createCANSFile(tmpDir, validCANSData);

      // First load to establish hash
      const gate1 = new ActivationGate(tmpDir, auditCallback);
      gate1.check();
      auditEntries.length = 0; // Clear initial entries

      // Modify content
      const modified = { ...validCANSData, provider: { ...validCANSData.provider, name: 'Dr. Tampered' } };
      createCANSFile(tmpDir, modified);

      // Second load triggers integrity failure
      const gate2 = new ActivationGate(tmpDir, auditCallback);
      gate2.check();

      expect(auditEntries.some(e => e.action === 'cans_integrity_failure')).toBe(true);
    });
  });
});
