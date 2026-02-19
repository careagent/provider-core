import { describe, it, expect } from 'vitest';
import {
  SkillManifestSchema,
  validateManifest,
} from '../../../src/skills/manifest-schema.js';
import { Value } from '@sinclair/typebox/value';

function validManifest() {
  return {
    skill_id: 'chart-skill',
    version: '1.0.0',
    requires: {
      license: ['MD', 'DO'],
      specialty: ['neurosurgery'],
    },
    files: {
      'index.ts': 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
      'template.json': 'def456abc123def456abc123def456abc123def456abc123def456abc123defg',
    },
    pinned: true,
    approved_version: '1.0.0',
  };
}

describe('SkillManifestSchema', () => {
  it('validates a complete valid manifest', () => {
    expect(Value.Check(SkillManifestSchema, validManifest())).toBe(true);
  });

  it('rejects missing skill_id', () => {
    const data = validManifest();
    delete (data as Record<string, unknown>).skill_id;
    expect(Value.Check(SkillManifestSchema, data)).toBe(false);
  });

  it('rejects empty skill_id', () => {
    const data = validManifest();
    data.skill_id = '';
    expect(Value.Check(SkillManifestSchema, data)).toBe(false);
  });

  it('rejects invalid version format (not semver)', () => {
    const data = validManifest();
    data.version = 'v1.0';
    expect(Value.Check(SkillManifestSchema, data)).toBe(false);
  });

  it('rejects version with prefix', () => {
    const data = validManifest();
    data.version = 'v1.0.0';
    expect(Value.Check(SkillManifestSchema, data)).toBe(false);
  });

  it('accepts valid semver version', () => {
    const data = validManifest();
    data.version = '2.10.3';
    expect(Value.Check(SkillManifestSchema, data)).toBe(true);
  });

  it('rejects missing files field', () => {
    const data = validManifest();
    delete (data as Record<string, unknown>).files;
    expect(Value.Check(SkillManifestSchema, data)).toBe(false);
  });

  it('accepts empty requires object (no credential requirements)', () => {
    const data = validManifest();
    data.requires = {};
    expect(Value.Check(SkillManifestSchema, data)).toBe(true);
  });

  it('accepts requires with only license', () => {
    const data = validManifest();
    data.requires = { license: ['NP'] };
    expect(Value.Check(SkillManifestSchema, data)).toBe(true);
  });

  it('accepts requires with all fields', () => {
    const data = validManifest();
    data.requires = {
      license: ['MD'],
      specialty: ['cardiology'],
      privilege: ['cardiac catheterization'],
    };
    expect(Value.Check(SkillManifestSchema, data)).toBe(true);
  });

  it('tolerates extra fields (TypeBox default)', () => {
    const data = {
      ...validManifest(),
      extra_field: 'should be ignored',
      metadata: { author: 'test' },
    };
    expect(Value.Check(SkillManifestSchema, data)).toBe(true);
  });

  it('accepts empty files record', () => {
    const data = validManifest();
    data.files = {};
    expect(Value.Check(SkillManifestSchema, data)).toBe(true);
  });
});

describe('validateManifest', () => {
  it('returns valid: true with parsed manifest on success', () => {
    const result = validateManifest(validManifest());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.manifest.skill_id).toBe('chart-skill');
      expect(result.manifest.version).toBe('1.0.0');
      expect(result.manifest.pinned).toBe(true);
    }
  });

  it('returns valid: false with error strings on failure', () => {
    const result = validateManifest({ skill_id: '' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      for (const err of result.errors) {
        expect(typeof err).toBe('string');
      }
    }
  });

  it('returns error strings with field paths', () => {
    const data = validManifest();
    data.version = 'bad';
    delete (data as Record<string, unknown>).pinned;

    const result = validateManifest(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const combined = result.errors.join('\n');
      expect(combined).toContain('/version');
      expect(combined).toContain('/pinned');
    }
  });

  it('rejects non-object input', () => {
    const result = validateManifest('not an object');
    expect(result.valid).toBe(false);
  });

  it('rejects null input', () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
  });
});
