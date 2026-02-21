/**
 * Tests for CANS.md content generator.
 */

import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { generateCANSContent, generatePreview } from '../../../src/onboarding/cans-generator.js';
import { CANSSchema } from '../../../src/activation/cans-schema.js';
import { parseFrontmatter } from '../../../src/activation/cans-parser.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';

const PHILOSOPHY =
  'Evidence-based neurosurgical practice with emphasis on minimally invasive techniques and shared decision-making with patients.';

// ---------------------------------------------------------------------------
// generateCANSContent — success cases
// ---------------------------------------------------------------------------

describe('generateCANSContent', () => {
  it('returns success: true with content when data is valid', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  it('generated content starts with ---\\n', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toMatch(/^---\n/);
  });

  it('generated content contains the closing frontmatter delimiter ---\\n\\n', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toContain('---\n\n');
  });

  it('generated content includes markdown heading # Care Agent Nervous System', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toContain('# Care Agent Nervous System');
  });

  it('generated content includes philosophy text in the body', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toContain(PHILOSOPHY);
  });

  it('round-trip: parseFrontmatter + Value.Check passes on generated content', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toBeDefined();

    const parsed = parseFrontmatter(result.content!);
    expect(parsed.error).toBeUndefined();
    expect(parsed.frontmatter).not.toBeNull();

    const valid = Value.Check(CANSSchema, parsed.frontmatter);
    expect(valid).toBe(true);
  });

  it('returns document: data on success', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.document).toBeDefined();
    expect(result.document?.provider.name).toBe('Dr. Test Provider');
  });

  it('generated content includes provider types', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    const content = result.content!;
    expect(content).toContain('Physician');
  });

  it('generated content includes organization name', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    const content = result.content!;
    expect(content).toContain('University Medical Center');
  });

  it('generated content includes all 7 autonomy tiers', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    const content = result.content!;
    expect(content).toContain('Chart');
    expect(content).toContain('Order');
    expect(content).toContain('Charge');
    expect(content).toContain('Perform');
    expect(content).toContain('Interpret');
    expect(content).toContain('Educate');
    expect(content).toContain('Coordinate');
  });

  it('philosophy text appears in body (after closing ---), not in YAML frontmatter', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    const content = result.content!;

    // Find the closing --- delimiter position
    const closingDelimiter = content.indexOf('---\n\n');
    expect(closingDelimiter).toBeGreaterThan(0);

    const yamlPart = content.slice(0, closingDelimiter);
    const bodyPart = content.slice(closingDelimiter);

    // Philosophy must be in body, not in YAML
    expect(bodyPart).toContain(PHILOSOPHY);
    expect(yamlPart).not.toContain(PHILOSOPHY);
  });

  it('optional fields omitted from YAML when not present (no subspecialty)', () => {
    const minimalData: CANSDocument = {
      version: '2.0',
      provider: {
        name: 'Dr. Minimal',
        types: ['Physician'],
        degrees: ['DO'],
        licenses: ['DO-CA-B99999'],
        certifications: [],
        organizations: [
          { name: 'Community Clinic', primary: true },
        ],
      },
      scope: {
        permitted_actions: ['chart_progress_note'],
      },
      autonomy: {
        chart: 'autonomous',
        order: 'supervised',
        charge: 'supervised',
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

    const result = generateCANSContent(minimalData, 'Patient-centered care.');
    expect(result.success).toBe(true);

    const parsed = parseFrontmatter(result.content!);
    const fm = parsed.frontmatter as Record<string, unknown>;
    const provider = fm.provider as Record<string, unknown>;

    // Optional fields not present in original data should not appear in YAML
    expect(provider.subspecialty).toBeUndefined();
    expect(provider.npi).toBeUndefined();
  });

  it('includes subspecialty in body when present', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toContain('Subspecialty: Spine');
  });

  it('includes organization in body when present', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toContain('University Medical Center');
  });
});

// ---------------------------------------------------------------------------
// generateCANSContent — error cases
// ---------------------------------------------------------------------------

describe('generateCANSContent with invalid data', () => {
  it('returns success: false with errors when required field is missing', () => {
    // Remove provider.name
    const invalidData = {
      ...validCANSData,
      provider: {
        ...validCANSData.provider,
        name: '',  // violates minLength: 1
      },
    };

    const result = generateCANSContent(invalidData as CANSDocument, PHILOSOPHY);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.content).toBeUndefined();
  });

  it('returns success: false with errors when types array is empty', () => {
    const invalidData = {
      ...validCANSData,
      provider: {
        ...validCANSData.provider,
        types: [],  // violates minItems: 1
      },
    };

    const result = generateCANSContent(invalidData as CANSDocument, PHILOSOPHY);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('errors include path and message fields', () => {
    const invalidData = {
      ...validCANSData,
      provider: {
        ...validCANSData.provider,
        name: '',
      },
    };

    const result = generateCANSContent(invalidData as CANSDocument, PHILOSOPHY);
    expect(result.errors![0]).toHaveProperty('path');
    expect(result.errors![0]).toHaveProperty('message');
  });
});

// ---------------------------------------------------------------------------
// generatePreview
// ---------------------------------------------------------------------------

describe('generatePreview', () => {
  it('returns a readable string containing provider name', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(typeof preview).toBe('string');
    expect(preview).toContain('Dr. Test Provider');
  });

  it('preview contains specialty', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('Neurosurgery');
  });

  it('preview contains provider types', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('Physician');
  });

  it('preview contains organization name', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('University Medical Center');
  });

  it('preview contains all 7 autonomy tiers', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('Chart:');
    expect(preview).toContain('Order:');
    expect(preview).toContain('Charge:');
    expect(preview).toContain('Perform:');
    expect(preview).toContain('Interpret:');
    expect(preview).toContain('Educate:');
    expect(preview).toContain('Coordinate:');
    expect(preview).toContain('autonomous');
    expect(preview).toContain('supervised');
    expect(preview).toContain('manual');
  });

  it('preview contains consent status', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('Consent');
    expect(preview).toContain('yes');
  });

  it('preview contains acknowledged_at timestamp', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('Acknowledged at:');
    expect(preview).toContain('2026-02-21T00:00:00.000Z');
  });
});
