import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { operativeNoteTemplate } from '../../../src/skills/chart-skill/templates/operative-note.js';
import { hAndPTemplate } from '../../../src/skills/chart-skill/templates/h-and-p.js';
import { progressNoteTemplate } from '../../../src/skills/chart-skill/templates/progress-note.js';
import {
  getTemplate,
  getAllTemplates,
} from '../../../src/skills/chart-skill/index.js';
import {
  extractVoiceDirectives,
  buildVoiceInstructions,
} from '../../../src/skills/chart-skill/voice-adapter.js';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

describe('operativeNoteTemplate', () => {
  it('has templateId "operative-note" and 17 sections', () => {
    expect(operativeNoteTemplate.templateId).toBe('operative-note');
    expect(operativeNoteTemplate.sections).toHaveLength(17);
  });

  it('has all required sections marked required: true (12 required, 5 optional)', () => {
    const required = operativeNoteTemplate.sections.filter((s) => s.required);
    const optional = operativeNoteTemplate.sections.filter((s) => !s.required);
    expect(required).toHaveLength(12);
    expect(optional).toHaveLength(5);
  });

  it('has neurosurgery-specific sections (Implants/Hardware, Fluids/Drains, Neuromonitoring)', () => {
    const sectionNames = operativeNoteTemplate.sections.map((s) => s.name);
    expect(sectionNames).toContain('Implants/Hardware');
    expect(sectionNames).toContain('Fluids/Drains');
    expect(sectionNames).toContain('Neuromonitoring');
  });
});

describe('hAndPTemplate', () => {
  it('has templateId "h-and-p" and 14 sections', () => {
    expect(hAndPTemplate.templateId).toBe('h-and-p');
    expect(hAndPTemplate.sections).toHaveLength(14);
  });

  it('includes Neurological Examination as required', () => {
    const neuro = hAndPTemplate.sections.find(
      (s) => s.name === 'Neurological Examination',
    );
    expect(neuro).toBeDefined();
    expect(neuro!.required).toBe(true);
  });
});

describe('progressNoteTemplate', () => {
  it('has templateId "progress-note" and 6 sections', () => {
    expect(progressNoteTemplate.templateId).toBe('progress-note');
    expect(progressNoteTemplate.sections).toHaveLength(6);
  });

  it('includes Neurological Status as required', () => {
    const neuro = progressNoteTemplate.sections.find(
      (s) => s.name === 'Neurological Status',
    );
    expect(neuro).toBeDefined();
    expect(neuro!.required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

describe('chart-skill index', () => {
  it('getTemplate("operative-note") returns operativeNoteTemplate', () => {
    expect(getTemplate('operative-note')).toBe(operativeNoteTemplate);
  });

  it('getTemplate("h-and-p") returns hAndPTemplate', () => {
    expect(getTemplate('h-and-p')).toBe(hAndPTemplate);
  });

  it('getTemplate("progress-note") returns progressNoteTemplate', () => {
    expect(getTemplate('progress-note')).toBe(progressNoteTemplate);
  });

  it('getTemplate("unknown") returns undefined', () => {
    expect(getTemplate('unknown')).toBeUndefined();
  });

  it('getAllTemplates() returns array of 3 templates', () => {
    const all = getAllTemplates();
    expect(all).toHaveLength(3);
    expect(all).toContain(operativeNoteTemplate);
    expect(all).toContain(hAndPTemplate);
    expect(all).toContain(progressNoteTemplate);
  });
});

// ---------------------------------------------------------------------------
// Voice Adapter
// ---------------------------------------------------------------------------

describe('extractVoiceDirectives', () => {
  it('returns empty object when voice is undefined', () => {
    expect(extractVoiceDirectives(undefined)).toEqual({});
  });

  it('returns all directives when voice has all fields', () => {
    const result = extractVoiceDirectives({
      tone: 'professional',
      documentation_style: 'detailed',
      eponyms: true,
      abbreviations: 'standard',
    });
    expect(result).toEqual({
      tone: 'professional',
      documentationStyle: 'detailed',
      useEponyms: true,
      abbreviationStyle: 'standard',
    });
  });

  it('returns only defined directives for partial voice', () => {
    const result = extractVoiceDirectives({
      tone: 'concise',
    });
    expect(result).toEqual({ tone: 'concise' });
    expect(result).not.toHaveProperty('documentationStyle');
    expect(result).not.toHaveProperty('useEponyms');
    expect(result).not.toHaveProperty('abbreviationStyle');
  });
});

describe('buildVoiceInstructions', () => {
  it('returns safety line only when directives are empty', () => {
    const result = buildVoiceInstructions({});
    expect(result).toBe(
      'Voice preferences affect language style only. All required clinical content must be present regardless of voice settings.',
    );
  });

  it('includes tone instruction when tone is set', () => {
    const result = buildVoiceInstructions({ tone: 'formal' });
    expect(result).toContain('Write in a formal tone.');
  });

  it('includes eponym instruction when useEponyms is true', () => {
    const result = buildVoiceInstructions({ useEponyms: true });
    expect(result).toContain(
      'Use standard medical eponyms (e.g., Babinski sign, Kernohan notch phenomenon).',
    );
  });

  it('includes anti-eponym instruction when useEponyms is false', () => {
    const result = buildVoiceInstructions({ useEponyms: false });
    expect(result).toContain(
      'Avoid eponyms; use descriptive terminology.',
    );
  });

  it('always includes safety line about content completeness', () => {
    const result = buildVoiceInstructions({
      tone: 'professional',
      documentationStyle: 'detailed',
      useEponyms: true,
      abbreviationStyle: 'standard',
    });
    expect(result).toContain(
      'Voice preferences affect language style only. All required clinical content must be present regardless of voice settings.',
    );
  });
});

// ---------------------------------------------------------------------------
// Manifest Integrity
// ---------------------------------------------------------------------------

describe('skill-manifest integrity', () => {
  const manifestPath = join(
    __dirname,
    '../../../skills/chart-skill/skill-manifest.json',
  );
  const skillMdPath = join(
    __dirname,
    '../../../skills/chart-skill/SKILL.md',
  );

  it('skill-manifest.json is valid JSON', () => {
    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);
    expect(manifest.skill_id).toBe('chart-skill');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.pinned).toBe(true);
    expect(manifest.approved_version).toBe('1.0.0');
    expect(manifest.requires.license).toEqual(['MD', 'DO']);
  });

  it('SKILL.md exists and is non-empty', () => {
    const content = readFileSync(skillMdPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('Clinical Documentation Generator');
  });

  it('SKILL.md hash in manifest matches actual file hash', () => {
    const manifestRaw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    const expectedHash = manifest.files['SKILL.md'];

    const content = readFileSync(skillMdPath, 'utf-8');
    const actualHash = createHash('sha256')
      .update(content, 'utf-8')
      .digest('hex');

    expect(actualHash).toBe(expectedHash);
  });
});
