import { describe, it, expect } from 'vitest';
import {
  checkVersionPin,
  approveVersion,
} from '../../../src/skills/version-pin.js';
import type { SkillManifest } from '../../../src/skills/types.js';

function pinnedManifest(overrides?: Partial<SkillManifest>): SkillManifest {
  return {
    skill_id: 'chart-skill',
    version: '1.0.0',
    requires: { license: ['MD'] },
    files: { 'index.ts': 'abc123' },
    pinned: true,
    approved_version: '1.0.0',
    ...overrides,
  };
}

describe('checkVersionPin', () => {
  it('pinned manifest with no available version: updateAvailable false', () => {
    const result = checkVersionPin(pinnedManifest());
    expect(result.pinned).toBe(true);
    expect(result.currentVersion).toBe('1.0.0');
    expect(result.approvedVersion).toBe('1.0.0');
    expect(result.updateAvailable).toBe(false);
    expect(result.availableVersion).toBeUndefined();
  });

  it('pinned manifest with same version: updateAvailable false', () => {
    const result = checkVersionPin(pinnedManifest(), '1.0.0');
    expect(result.updateAvailable).toBe(false);
    expect(result.availableVersion).toBe('1.0.0');
  });

  it('pinned manifest with different version: updateAvailable true', () => {
    const result = checkVersionPin(pinnedManifest(), '2.0.0');
    expect(result.updateAvailable).toBe(true);
    expect(result.availableVersion).toBe('2.0.0');
    expect(result.pinned).toBe(true);
  });

  it('unpinned manifest with different version: updateAvailable false', () => {
    const manifest = pinnedManifest({ pinned: false });
    const result = checkVersionPin(manifest, '2.0.0');
    expect(result.updateAvailable).toBe(false);
    expect(result.pinned).toBe(false);
    expect(result.availableVersion).toBe('2.0.0');
  });

  it('returns correct currentVersion and approvedVersion', () => {
    const manifest = pinnedManifest({
      version: '1.2.0',
      approved_version: '1.2.0',
    });
    const result = checkVersionPin(manifest, '1.3.0');
    expect(result.currentVersion).toBe('1.2.0');
    expect(result.approvedVersion).toBe('1.2.0');
    expect(result.updateAvailable).toBe(true);
  });
});

describe('approveVersion', () => {
  it('returns new object with updated version fields', () => {
    const manifest = pinnedManifest();
    const approved = approveVersion(manifest, '2.0.0');

    expect(approved.version).toBe('2.0.0');
    expect(approved.approved_version).toBe('2.0.0');
    expect(approved.skill_id).toBe('chart-skill');
    expect(approved.pinned).toBe(true);
  });

  it('does not mutate the input manifest', () => {
    const manifest = pinnedManifest();
    const originalVersion = manifest.version;
    const originalApproved = manifest.approved_version;

    approveVersion(manifest, '3.0.0');

    expect(manifest.version).toBe(originalVersion);
    expect(manifest.approved_version).toBe(originalApproved);
  });

  it('returns a different object reference', () => {
    const manifest = pinnedManifest();
    const approved = approveVersion(manifest, '2.0.0');
    expect(approved).not.toBe(manifest);
  });

  it('preserves all other manifest fields', () => {
    const manifest = pinnedManifest({
      requires: { license: ['MD', 'DO'], specialty: ['neurosurgery'] },
      files: { 'index.ts': 'hash1', 'template.json': 'hash2' },
    });
    const approved = approveVersion(manifest, '2.0.0');

    expect(approved.skill_id).toBe(manifest.skill_id);
    expect(approved.requires).toEqual(manifest.requires);
    expect(approved.files).toEqual(manifest.files);
    expect(approved.pinned).toBe(manifest.pinned);
  });

  it('creates deep copies of requires and files', () => {
    const manifest = pinnedManifest({
      requires: { license: ['MD'] },
      files: { 'index.ts': 'hash1' },
    });
    const approved = approveVersion(manifest, '2.0.0');

    expect(approved.requires).not.toBe(manifest.requires);
    expect(approved.files).not.toBe(manifest.files);
  });
});
