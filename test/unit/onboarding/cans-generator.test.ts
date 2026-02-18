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

  it('all hardening flags appear in generated content', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    const content = result.content!;
    expect(content).toContain('tool_policy_lockdown');
    expect(content).toContain('exec_approval');
    expect(content).toContain('cans_protocol_injection');
    expect(content).toContain('docker_sandbox');
    expect(content).toContain('safety_guard');
    expect(content).toContain('audit_trail');
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

  it('optional fields omitted from YAML when not present (no subspecialty/institution)', () => {
    const minimalData: CANSDocument = {
      version: '1.0',
      provider: {
        name: 'Dr. Minimal',
        license: { type: 'DO', state: 'CA', number: 'B99999', verified: false },
        specialty: 'Internal Medicine',
        privileges: ['general medical care'],
      },
      scope: {
        permitted_actions: ['chart_progress_note'],
      },
      autonomy: {
        chart: 'autonomous',
        order: 'supervised',
        charge: 'supervised',
        perform: 'manual',
      },
      hardening: {
        tool_policy_lockdown: true,
        exec_approval: true,
        cans_protocol_injection: true,
        docker_sandbox: true,
        safety_guard: true,
        audit_trail: true,
      },
      consent: {
        hipaa_warning_acknowledged: true,
        synthetic_data_only: true,
        audit_consent: true,
      },
    };

    const result = generateCANSContent(minimalData, 'Patient-centered care.');
    expect(result.success).toBe(true);

    const parsed = parseFrontmatter(result.content!);
    const fm = parsed.frontmatter as Record<string, unknown>;
    const provider = fm.provider as Record<string, unknown>;

    // Optional fields not present in original data should not appear in YAML
    expect(provider.subspecialty).toBeUndefined();
    expect(provider.institution).toBeUndefined();
    expect(provider.npi).toBeUndefined();
  });

  it('includes subspecialty in body when present', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toContain('Subspecialty: Spine');
  });

  it('includes institution in body when present', () => {
    const result = generateCANSContent(validCANSData as CANSDocument, PHILOSOPHY);
    expect(result.content).toContain('Institution: University Medical Center');
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

  it('returns success: false with errors when license type is invalid', () => {
    const invalidData = {
      ...validCANSData,
      provider: {
        ...validCANSData.provider,
        license: {
          ...validCANSData.provider.license,
          type: 'RN' as 'MD',  // not a valid literal
        },
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

  it('preview contains all autonomy tiers', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('Chart:');
    expect(preview).toContain('Order:');
    expect(preview).toContain('Charge:');
    expect(preview).toContain('Perform:');
    expect(preview).toContain('autonomous');
    expect(preview).toContain('supervised');
    expect(preview).toContain('manual');
  });

  it('preview contains hardening flags', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('tool_policy_lockdown');
    expect(preview).toContain('exec_approval');
    expect(preview).toContain('safety_guard');
    expect(preview).toContain('audit_trail');
  });

  it('preview contains consent status', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    expect(preview).toContain('Consent');
    expect(preview).toContain('yes');
  });

  it('preview shows ON/OFF for hardening flags', () => {
    const preview = generatePreview(validCANSData as CANSDocument, PHILOSOPHY);
    // validCANSData has docker_sandbox: false
    expect(preview).toContain('docker_sandbox: OFF');
    expect(preview).toContain('tool_policy_lockdown: ON');
  });
});
