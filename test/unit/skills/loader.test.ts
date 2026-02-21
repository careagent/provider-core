import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { loadClinicalSkills } from '../../../src/skills/loader.js';
import { createCredentialValidator } from '../../../src/credentials/validator.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';
import type { AuditLogInput } from '../../../src/audit/pipeline.js';
import type { SkillManifest } from '../../../src/skills/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function makeTempSkillsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-loader-test-'));
  tempDirs.push(dir);
  return dir;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Add a clinical skill to a base directory.
 * Computes real SHA-256 hashes for SKILL.md so integrity checks pass.
 */
function addSkill(
  baseDir: string,
  skillId: string,
  manifestOverrides: Partial<SkillManifest> = {},
  skillMdContent = '# Default Skill\n\nSkill content here.',
): void {
  const skillDir = join(baseDir, skillId);
  mkdirSync(skillDir, { recursive: true });

  const skillMdHash = sha256(skillMdContent);

  const manifest: SkillManifest = {
    skill_id: skillId,
    version: '1.0.0',
    requires: {},
    files: { 'SKILL.md': skillMdHash },
    pinned: true,
    approved_version: '1.0.0',
    ...manifestOverrides,
  };

  // If overrides provide custom files, merge with SKILL.md hash
  if (manifestOverrides.files) {
    manifest.files = { 'SKILL.md': skillMdHash, ...manifestOverrides.files };
  } else {
    manifest.files = { 'SKILL.md': skillMdHash };
  }

  writeFileSync(
    join(skillDir, 'skill-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
  writeFileSync(join(skillDir, 'SKILL.md'), skillMdContent, 'utf-8');
}

function makeCANS(overrides?: {
  provider?: Partial<CANSDocument['provider']>;
  skills?: CANSDocument['skills'];
}): CANSDocument {
  const base: CANSDocument = {
    version: '2.0',
    provider: {
      name: 'Dr. Test',
      npi: '1234567890',
      types: ['Physician'],
      degrees: ['MD'],
      licenses: ['MD-CA-12345'],
      certifications: [],
      specialty: 'Neurosurgery',
      subspecialty: 'Spine',
      organizations: [
        {
          name: 'University Medical Center',
          privileges: ['surgical_procedures', 'craniotomy', 'spinal_fusion'],
          primary: true,
        },
      ],
      credential_status: 'active',
    },
    scope: {
      permitted_actions: ['chart_review', 'documentation'],
    },
    autonomy: {
      chart: 'autonomous',
      order: 'supervised',
      charge: 'manual',
      perform: 'manual',
      interpret: 'manual',
      educate: 'manual',
      coordinate: 'manual',
    },
    consent: {
      hipaa_warning_acknowledged: true,
      synthetic_data_only: true,
      audit_consent: true,
      acknowledged_at: '2026-02-21T00:00:00.000Z',
    },
    skills: {
      authorized: [],
    },
  };

  if (overrides?.provider) {
    Object.assign(base.provider, overrides.provider);
  }

  if (overrides?.skills !== undefined) {
    base.skills = overrides.skills;
  }

  return base;
}

function makeMockAudit() {
  const calls: AuditLogInput[] = [];
  return {
    audit: {
      log: (input: AuditLogInput) => calls.push(input),
      createTraceId: () => 'test-trace',
    } as any,
    calls,
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadClinicalSkills', () => {
  const validator = createCredentialValidator();

  // -----------------------------------------------------------------------
  // Credential gating (SKIL-01)
  // -----------------------------------------------------------------------

  describe('credential gating (SKIL-01)', () => {
    it('MD provider loads skill requiring ["MD", "DO"]', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'neuro-notes', {
        requires: { license: ['MD', 'DO'] },
      });
      const cans = makeCANS({ provider: { types: ['Physician'], degrees: ['MD'] } });
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
      expect(results[0].skillId).toBe('neuro-notes');
    });

    it('NP provider fails to load skill requiring ["MD", "DO"]', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'neuro-notes', {
        requires: { license: ['MD', 'DO'] },
      });
      const cans = makeCANS({
        provider: {
          types: ['Nurse Practitioner'],
          degrees: ['MSN'],
          licenses: ['NP-CA-99999'],
          specialty: 'Neurosurgery',
        },
      });
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('credentials');
    });

    it('audit contains skill_credential_check entries', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'neuro-notes', {
        requires: { license: ['MD', 'DO'] },
      });
      const cans = makeCANS({ provider: { types: ['Physician'], degrees: ['MD'] } });
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const credChecks = calls.filter(
        (c) => c.action === 'skill_credential_check',
      );
      expect(credChecks).toHaveLength(1);
      expect(credChecks[0].outcome).toBe('allowed');
    });

    it('audit contains denied credential check for NP provider', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'neuro-notes', {
        requires: { license: ['MD', 'DO'] },
      });
      const cans = makeCANS({
        provider: {
          types: ['Nurse Practitioner'],
          degrees: ['MSN'],
          licenses: ['NP-CA-99999'],
          specialty: 'Neurosurgery',
        },
      });
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const credChecks = calls.filter(
        (c) => c.action === 'skill_credential_check',
      );
      expect(credChecks).toHaveLength(1);
      expect(credChecks[0].outcome).toBe('denied');
    });
  });

  // -----------------------------------------------------------------------
  // Regular skills (SKIL-02)
  // -----------------------------------------------------------------------

  describe('regular skills (SKIL-02)', () => {
    it('directory without skill-manifest.json is skipped', () => {
      const baseDir = makeTempSkillsDir();
      // Create a directory without a manifest (regular OpenClaw skill)
      mkdirSync(join(baseDir, 'regular-tool'));
      writeFileSync(
        join(baseDir, 'regular-tool', 'index.ts'),
        'export default {};',
        'utf-8',
      );
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(0);
    });

    it('skill with empty requires loads for any provider', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'generic-skill', { requires: {} });
      const cans = makeCANS({
        provider: {
          types: ['Physician Assistant'],
          degrees: ['PA'],
          licenses: ['PA-TX-11111'],
          specialty: 'Family Medicine',
        },
      });
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Integrity verification (SKIL-03)
  // -----------------------------------------------------------------------

  describe('integrity verification (SKIL-03)', () => {
    it('skill with correct checksums loads', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'verified-skill');
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('skill with modified SKILL.md fails integrity check', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'tampered-skill');
      // Tamper with the file after the manifest was written with the correct hash
      writeFileSync(
        join(baseDir, 'tampered-skill', 'SKILL.md'),
        '# Tampered content',
        'utf-8',
      );
      const cans = makeCANS();
      const { audit, calls } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('Hash mismatch');

      const integrityChecks = calls.filter(
        (c) => c.action === 'skill_integrity_check',
      );
      expect(integrityChecks).toHaveLength(1);
      expect(integrityChecks[0].outcome).toBe('denied');
    });

    it('audit contains skill_integrity_check allowed for valid skill', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'good-skill');
      const cans = makeCANS();
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const integrityChecks = calls.filter(
        (c) => c.action === 'skill_integrity_check',
      );
      expect(integrityChecks).toHaveLength(1);
      expect(integrityChecks[0].outcome).toBe('allowed');
    });
  });

  // -----------------------------------------------------------------------
  // Version pinning (SKIL-04)
  // -----------------------------------------------------------------------

  describe('version pinning (SKIL-04)', () => {
    it('pinned skill with matching approved_version loads', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'pinned-skill', {
        pinned: true,
        version: '1.0.0',
        approved_version: '1.0.0',
      });
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('pinned skill with mismatched approved_version is blocked', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'version-mismatch', {
        pinned: true,
        version: '1.1.0',
        approved_version: '1.0.0',
      });
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('Version update requires approval');
      expect(results[0].reason).toContain('v1.1.0');
      expect(results[0].reason).toContain('v1.0.0');
    });

    it('unpinned skill loads without version check blocking', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'unpinned-skill', {
        pinned: false,
        version: '2.0.0',
        approved_version: '1.0.0',
      });
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('audit contains skill_version_check denied for mismatched version', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'version-mismatch', {
        pinned: true,
        version: '1.1.0',
        approved_version: '1.0.0',
      });
      const cans = makeCANS();
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const versionChecks = calls.filter(
        (c) => c.action === 'skill_version_check',
      );
      expect(versionChecks).toHaveLength(1);
      expect(versionChecks[0].outcome).toBe('denied');
      expect((versionChecks[0].details as any).current_version).toBe('1.1.0');
      expect((versionChecks[0].details as any).approved_version).toBe('1.0.0');
    });

    it('audit contains skill_version_check allowed for matching version', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'good-version', {
        pinned: true,
        version: '1.0.0',
        approved_version: '1.0.0',
      });
      const cans = makeCANS();
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const versionChecks = calls.filter(
        (c) => c.action === 'skill_version_check',
      );
      expect(versionChecks).toHaveLength(1);
      expect(versionChecks[0].outcome).toBe('allowed');
    });
  });

  // -----------------------------------------------------------------------
  // CANS skills.authorized
  // -----------------------------------------------------------------------

  describe('CANS skills.authorized', () => {
    it('empty authorized list allows all skills (no restriction)', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'normal-skill');
      const cans = makeCANS({ skills: { authorized: [] } });
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('skill in authorized list is allowed', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'my-skill');
      const cans = makeCANS({ skills: { authorized: ['my-skill'] } });
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('skill NOT in non-empty authorized list is blocked', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'unlisted-skill');
      const cans = makeCANS({ skills: { authorized: ['other-skill'] } });
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('not in the authorized skills list');
    });

    it('CANS without skills section defaults allow all', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'normal-skill');
      const cans = makeCANS(); // default skills: { authorized: [] }
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });

    it('authorized list for different skill does not affect current skill', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'my-skill');
      const cans = makeCANS({ skills: { authorized: ['my-skill', 'other-skill'] } });
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Manifest validation
  // -----------------------------------------------------------------------

  describe('manifest validation', () => {
    it('invalid manifest JSON fails', () => {
      const baseDir = makeTempSkillsDir();
      const skillDir = join(baseDir, 'bad-json');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'skill-manifest.json'),
        'not valid json!!!',
        'utf-8',
      );
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('Invalid manifest');
    });

    it('missing skill_id in manifest fails', () => {
      const baseDir = makeTempSkillsDir();
      const skillDir = join(baseDir, 'missing-id');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'skill-manifest.json'),
        JSON.stringify({
          version: '1.0.0',
          requires: {},
          files: {},
          pinned: true,
          approved_version: '1.0.0',
        }),
        'utf-8',
      );
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(1);
      expect(results[0].loaded).toBe(false);
      expect(results[0].reason).toContain('Invalid manifest');
    });
  });

  // -----------------------------------------------------------------------
  // Audit logging (SKIL-07)
  // -----------------------------------------------------------------------

  describe('audit logging (SKIL-07)', () => {
    it('successful load produces full audit trail', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'audited-skill');
      const cans = makeCANS();
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const actions = calls.map((c) => c.action);
      expect(actions).toEqual([
        'skill_discovery',
        'skill_version_check',
        'skill_credential_check',
        'skill_integrity_check',
        'skill_load',
      ]);

      expect(calls.find((c) => c.action === 'skill_version_check')!.outcome).toBe('allowed');
      expect(calls.find((c) => c.action === 'skill_credential_check')!.outcome).toBe('allowed');
      expect(calls.find((c) => c.action === 'skill_integrity_check')!.outcome).toBe('allowed');
      expect(calls.find((c) => c.action === 'skill_load')!.outcome).toBe('allowed');
    });

    it('version pin failure stops pipeline early', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'blocked-version', {
        pinned: true,
        version: '2.0.0',
        approved_version: '1.0.0',
      });
      const cans = makeCANS();
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const actions = calls.map((c) => c.action);
      expect(actions).toEqual(['skill_discovery', 'skill_version_check']);
      expect(calls[1].outcome).toBe('denied');
    });

    it('credential failure stops pipeline after version check', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'cred-fail', {
        requires: { license: ['MD', 'DO'] },
      });
      const cans = makeCANS({
        provider: {
          types: ['Nurse Practitioner'],
          degrees: ['MSN'],
          licenses: ['NP-CA-99999'],
          specialty: 'Neurosurgery',
        },
      });
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const actions = calls.map((c) => c.action);
      expect(actions).toEqual([
        'skill_discovery',
        'skill_version_check',
        'skill_credential_check',
      ]);
      expect(calls[2].outcome).toBe('denied');
    });

    it('integrity failure stops pipeline after credential check', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'integrity-fail');
      // Tamper with the file
      writeFileSync(
        join(baseDir, 'integrity-fail', 'SKILL.md'),
        '# Tampered!',
        'utf-8',
      );
      const cans = makeCANS();
      const { audit, calls } = makeMockAudit();

      loadClinicalSkills(baseDir, cans, validator, audit);

      const actions = calls.map((c) => c.action);
      expect(actions).toEqual([
        'skill_discovery',
        'skill_version_check',
        'skill_credential_check',
        'skill_integrity_check',
      ]);
      expect(calls[3].outcome).toBe('denied');
    });
  });

  // -----------------------------------------------------------------------
  // Multiple skills
  // -----------------------------------------------------------------------

  describe('multiple skills', () => {
    it('loads one and blocks one correctly', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'good-skill', {
        requires: { license: ['MD', 'DO'] },
      });
      addSkill(baseDir, 'bad-skill', {
        requires: { specialty: ['Dermatology'] },
      });
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toHaveLength(2);

      const good = results.find((r) => r.skillId === 'good-skill');
      const bad = results.find((r) => r.skillId === 'bad-skill');

      expect(good).toBeDefined();
      expect(good!.loaded).toBe(true);

      expect(bad).toBeDefined();
      expect(bad!.loaded).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty array for non-existent skills directory', () => {
      const { audit } = makeMockAudit();
      const cans = makeCANS();

      const results = loadClinicalSkills(
        '/tmp/does-not-exist-' + Date.now(),
        cans,
        validator,
        audit,
      );

      expect(results).toEqual([]);
    });

    it('returns empty array for empty skills directory', () => {
      const baseDir = makeTempSkillsDir();
      const { audit } = makeMockAudit();
      const cans = makeCANS();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results).toEqual([]);
    });

    it('loaded skill includes directory path', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'with-path');
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results[0].directory).toBe(join(baseDir, 'with-path'));
    });

    it('loaded skill includes version', () => {
      const baseDir = makeTempSkillsDir();
      addSkill(baseDir, 'versioned', { version: '2.3.1', approved_version: '2.3.1' });
      const cans = makeCANS();
      const { audit } = makeMockAudit();

      const results = loadClinicalSkills(baseDir, cans, validator, audit);

      expect(results[0].version).toBe('2.3.1');
    });
  });
});
