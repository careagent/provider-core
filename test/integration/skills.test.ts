/**
 * End-to-end skill loading integration tests.
 *
 * Verifies the complete skill loading pipeline:
 * - SKIL-01: Credential gating (license, specialty, privilege)
 * - SKIL-02: Regular skills (no manifest) silently skipped
 * - SKIL-03: Integrity verification (SHA-256 file hashes)
 * - SKIL-04: Version pinning (approved_version enforcement)
 * - SKIL-07: Audit trail completeness (all pipeline steps logged)
 *
 * Uses real temp workspaces with AuditPipeline and loadClinicalSkills
 * to verify the full integration from CANS activation through audit logging.
 */

import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditPipeline } from '../../src/audit/pipeline.js';
import { createCredentialValidator } from '../../src/credentials/validator.js';
import { loadClinicalSkills } from '../../src/skills/loader.js';
import type { CANSDocument } from '../../src/activation/cans-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'careagent-skills-'));
  mkdirSync(join(dir, '.careagent'), { recursive: true });
  return dir;
}

function makeSkillsDir(workspace: string): string {
  const skillsDir = join(workspace, 'skills');
  mkdirSync(skillsDir, { recursive: true });
  return skillsDir;
}

interface TestSkillOpts {
  version?: string;
  pinned?: boolean;
  approved_version?: string;
  requires?: {
    license?: string[];
    specialty?: string[];
    privilege?: string[];
  };
  skillContent?: string;
  tamperAfter?: boolean;
}

function addTestSkill(
  skillsDir: string,
  skillId: string,
  opts: TestSkillOpts = {},
): void {
  const skillDir = join(skillsDir, skillId);
  mkdirSync(skillDir, { recursive: true });

  const content = opts.skillContent || `# ${skillId}\n\nA test clinical skill.\n`;
  writeFileSync(join(skillDir, 'SKILL.md'), content);

  // Compute actual hash
  const hash = createHash('sha256').update(content, 'utf-8').digest('hex');

  const manifest = {
    skill_id: skillId,
    version: opts.version || '1.0.0',
    requires: opts.requires || {},
    files: { 'SKILL.md': hash },
    pinned: opts.pinned ?? true,
    approved_version: opts.approved_version || opts.version || '1.0.0',
  };

  writeFileSync(
    join(skillDir, 'skill-manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  // Optionally tamper with SKILL.md after manifest is written
  if (opts.tamperAfter) {
    writeFileSync(join(skillDir, 'SKILL.md'), content + '\n<!-- tampered -->');
  }
}

function makeCANS(overrides: Record<string, unknown> = {}): CANSDocument {
  const providerOverrides = (overrides.provider || {}) as Record<string, unknown>;
  const licenseOverrides = providerOverrides.license
    ? (providerOverrides.license as Record<string, unknown>)
    : {};

  // Build provider with license merged first, then overlay other provider overrides
  const { license: _licenseFromOverrides, ...providerRest } = providerOverrides;

  const provider = {
    name: 'Dr. Test',
    specialty: 'Neurosurgery',
    subspecialty: 'Spine',
    privileges: ['surgical_procedures', 'craniotomy', 'spinal_fusion'],
    ...providerRest,
    license: {
      type: 'MD' as const,
      state: 'CA',
      number: '12345',
      verified: false,
      ...licenseOverrides,
    },
  };

  return {
    version: '1.0.0',
    provider,
    scope: {
      permitted_actions: ['chart', 'order'],
      ...(overrides.scope as Record<string, unknown> || {}),
    },
    autonomy: {
      chart: 'autonomous',
      order: 'supervised',
      charge: 'manual',
      perform: 'manual',
      ...(overrides.autonomy as Record<string, unknown> || {}),
    },
    hardening: {
      tool_policy_lockdown: true,
      exec_approval: true,
      cans_protocol_injection: true,
      docker_sandbox: false,
      safety_guard: true,
      audit_trail: true,
      ...(overrides.hardening as Record<string, unknown> || {}),
    },
    consent: {
      hipaa_warning_acknowledged: true,
      synthetic_data_only: true,
      audit_consent: true,
      ...(overrides.consent as Record<string, unknown> || {}),
    },
    ...(overrides.skills !== undefined ? { skills: overrides.skills } : {}),
  } as CANSDocument;
}

function readAuditLog(workspace: string): Array<Record<string, unknown>> {
  const logPath = join(workspace, '.careagent', 'AUDIT.log');
  try {
    const content = readFileSync(logPath, 'utf-8');
    return content
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Skills Integration', () => {
  let workspace: string;
  let skillsDir: string;
  let audit: AuditPipeline;

  beforeEach(() => {
    workspace = makeWorkspace();
    skillsDir = makeSkillsDir(workspace);
    audit = new AuditPipeline(workspace);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // SKIL-01: Credential gating e2e
  // -------------------------------------------------------------------------

  describe('SKIL-01: Credential gating e2e', () => {
    it('MD provider loads skill requiring MD/DO credentials', () => {
      addTestSkill(skillsDir, 'surgery-skill', {
        requires: { license: ['MD', 'DO'] },
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
      expect(results[0].skillId).toBe('surgery-skill');
    });

    it('NP provider blocked from skill requiring MD/DO credentials', () => {
      addTestSkill(skillsDir, 'surgery-skill', {
        requires: { license: ['MD', 'DO'] },
      });

      const cans = makeCANS({
        provider: {
          name: 'Nurse Practitioner',
          license: { type: 'NP', state: 'CA', number: '99999', verified: false },
          specialty: 'Family Medicine',
          privileges: ['primary_care'],
        },
      });
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('missing required credentials');
    });

    it('audit log has correct credential check entries', () => {
      addTestSkill(skillsDir, 'gated-skill', {
        requires: { license: ['MD'] },
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      loadClinicalSkills(skillsDir, cans, validator, audit);

      const entries = readAuditLog(workspace);
      const credEntries = entries.filter(
        (e) => e.action === 'skill_credential_check',
      );
      expect(credEntries.length).toBeGreaterThanOrEqual(1);
      expect(credEntries[0].outcome).toBe('allowed');
    });
  });

  // -------------------------------------------------------------------------
  // SKIL-02: Regular skills unaffected
  // -------------------------------------------------------------------------

  describe('SKIL-02: Regular skills unaffected', () => {
    it('directory with SKILL.md but no manifest is not in results', () => {
      // Create a regular skill directory (no manifest)
      const regularDir = join(skillsDir, 'regular-skill');
      mkdirSync(regularDir, { recursive: true });
      writeFileSync(join(regularDir, 'SKILL.md'), '# Regular OpenClaw Skill\n');

      const cans = makeCANS();
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(0);

      // No audit entries for regular skills either
      const entries = readAuditLog(workspace);
      const skillEntries = entries.filter(
        (e) => (e.details as Record<string, unknown>)?.skill_id === 'regular-skill',
      );
      expect(skillEntries).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // SKIL-03: Integrity verification e2e
  // -------------------------------------------------------------------------

  describe('SKIL-03: Integrity verification e2e', () => {
    it('skill with correct checksums loads successfully', () => {
      addTestSkill(skillsDir, 'integrity-pass', {
        requires: { license: ['MD'] },
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('modified SKILL.md after manifest creation fails integrity', () => {
      addTestSkill(skillsDir, 'integrity-fail', {
        requires: { license: ['MD'] },
        tamperAfter: true,
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('Hash mismatch');

      // Audit should have integrity denied
      const entries = readAuditLog(workspace);
      const integrityDenied = entries.find(
        (e) =>
          e.action === 'skill_integrity_check' && e.outcome === 'denied',
      );
      expect(integrityDenied).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // SKIL-04: Version pinning e2e
  // -------------------------------------------------------------------------

  describe('SKIL-04: Version pinning e2e', () => {
    it('pinned skill with matching approved_version loads', () => {
      addTestSkill(skillsDir, 'pinned-ok', {
        version: '1.0.0',
        pinned: true,
        approved_version: '1.0.0',
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('pinned skill with mismatched approved_version is blocked', () => {
      addTestSkill(skillsDir, 'pinned-mismatch', {
        version: '1.1.0',
        pinned: true,
        approved_version: '1.0.0',
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('Version update requires approval');
    });

    it('blocked version has skill_version_check denied in audit', () => {
      addTestSkill(skillsDir, 'pinned-denied', {
        version: '1.1.0',
        pinned: true,
        approved_version: '1.0.0',
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      loadClinicalSkills(skillsDir, cans, validator, audit);

      const entries = readAuditLog(workspace);
      const versionDenied = entries.find(
        (e) =>
          e.action === 'skill_version_check' && e.outcome === 'denied',
      );
      expect(versionDenied).toBeDefined();
      expect(
        (versionDenied!.details as Record<string, unknown>).skill_id,
      ).toBe('pinned-denied');
    });

    it('version-blocked skill has no credential or integrity check entries', () => {
      addTestSkill(skillsDir, 'version-blocked-only', {
        version: '2.0.0',
        pinned: true,
        approved_version: '1.0.0',
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      loadClinicalSkills(skillsDir, cans, validator, audit);

      const entries = readAuditLog(workspace);
      const credEntries = entries.filter(
        (e) =>
          e.action === 'skill_credential_check' &&
          (e.details as Record<string, unknown>)?.skill_id === 'version-blocked-only',
      );
      const integrityEntries = entries.filter(
        (e) =>
          e.action === 'skill_integrity_check' &&
          (e.details as Record<string, unknown>)?.skill_id === 'version-blocked-only',
      );

      expect(credEntries).toHaveLength(0);
      expect(integrityEntries).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // SKIL-07: Audit trail completeness
  // -------------------------------------------------------------------------

  describe('SKIL-07: Audit trail completeness', () => {
    it('successful load produces audit entries in correct order', () => {
      addTestSkill(skillsDir, 'audit-trail-skill', {
        requires: { license: ['MD'] },
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      loadClinicalSkills(skillsDir, cans, validator, audit);

      const entries = readAuditLog(workspace);
      const skillEntries = entries.filter(
        (e) =>
          (e.details as Record<string, unknown>)?.skill_id === 'audit-trail-skill' ||
          (e.action === 'skill_discovery' &&
            (e.details as Record<string, unknown>)?.skill_id === 'audit-trail-skill'),
      );

      // Expected order: discovery, version_check(allowed), credential_check(allowed), integrity_check(allowed), load(allowed)
      const actions = skillEntries.map((e) => e.action);
      expect(actions).toEqual([
        'skill_discovery',
        'skill_version_check',
        'skill_credential_check',
        'skill_integrity_check',
        'skill_load',
      ]);

      // All should be positive outcomes
      const outcomes = skillEntries.map((e) => e.outcome);
      expect(outcomes).toEqual(['active', 'allowed', 'allowed', 'allowed', 'allowed']);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple skills with mixed outcomes
  // -------------------------------------------------------------------------

  describe('Multiple skills with mixed outcomes', () => {
    it('MD loads MD-requiring skill, blocks Dermatology-requiring skill', () => {
      addTestSkill(skillsDir, 'neuro-skill', {
        requires: { license: ['MD'] },
      });
      addTestSkill(skillsDir, 'derm-skill', {
        requires: { specialty: ['Dermatology'] },
      });

      const cans = makeCANS(); // MD Neurosurgery
      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(2);

      const neuro = results.find((r) => r.skillId === 'neuro-skill');
      const derm = results.find((r) => r.skillId === 'derm-skill');

      expect(neuro).toBeDefined();
      expect(neuro!.loaded).toBe(true);

      expect(derm).toBeDefined();
      expect(derm!.loaded).toBe(false);
      expect(derm!.reason).toContain('specialty');
    });
  });

  // -------------------------------------------------------------------------
  // CANS.md skills.rules integration
  // -------------------------------------------------------------------------

  describe('CANS.md skills.rules integration', () => {
    it('CANS rules block skill that would otherwise pass credential check', () => {
      // Skill requires MD license only -- our provider has that
      addTestSkill(skillsDir, 'test-skill', {
        requires: { license: ['MD'] },
      });

      // But CANS rules add a privilege requirement the provider lacks
      const cans = makeCANS({
        skills: {
          rules: [
            {
              skill_id: 'test-skill',
              requires_privilege: ['laser_surgery'],
            },
          ],
        },
      });

      const validator = createCredentialValidator();
      const results = loadClinicalSkills(skillsDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('laser_surgery');

      // Audit should show CANS rules credential denial
      const entries = readAuditLog(workspace);
      const cansRulesDenied = entries.find(
        (e) =>
          e.action === 'skill_credential_check' &&
          e.outcome === 'denied' &&
          (e.details as Record<string, unknown>)?.source === 'cans_rules',
      );
      expect(cansRulesDenied).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Hash chain integrity
  // -------------------------------------------------------------------------

  describe('Hash chain integrity', () => {
    it('audit chain remains valid after loading skills', () => {
      addTestSkill(skillsDir, 'chain-skill', {
        requires: { license: ['MD'] },
      });

      const cans = makeCANS();
      const validator = createCredentialValidator();
      loadClinicalSkills(skillsDir, cans, validator, audit);

      const chain = audit.verifyChain();
      expect(chain.valid).toBe(true);
      expect(chain.entries).toBeGreaterThan(0);
    });
  });
});
