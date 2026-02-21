/**
 * Unit tests for workspace-content.ts
 *
 * Verifies all three clinical content generators produce correct, complete
 * markdown sections from a valid CANS document.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSoulContent,
  generateAgentsContent,
  generateUserContent,
} from '../../../src/onboarding/workspace-content.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';

const philosophy = 'Evidence-based care with patient-centered communication.';

// ---------------------------------------------------------------------------
// generateSoulContent
// ---------------------------------------------------------------------------

describe('generateSoulContent', () => {
  it('includes provider name and specialty', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result).toContain('Dr. Test Provider');
    expect(result).toContain('Neurosurgery');
  });

  it('includes provider types', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result).toContain('Physician');
  });

  it('includes philosophy text', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result).toContain(philosophy);
  });

  it('includes permitted actions', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result).toContain('chart_operative_note');
    expect(result).toContain('chart_progress_note');
  });

  it('includes organization name', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result).toContain('University Medical Center');
  });

  it('includes voice directives when present', () => {
    const data: CANSDocument = {
      ...validCANSData,
      voice: {
        chart: 'formal, structured templates',
        order: 'concise',
      },
    };
    const result = generateSoulContent(data, philosophy);
    expect(result).toContain('chart: formal, structured templates');
    expect(result).toContain('order: concise');
  });

  it('omits voice section when voice is undefined', () => {
    const { voice: _v, ...rest } = validCANSData as CANSDocument;
    const data: CANSDocument = rest as CANSDocument;
    const result = generateSoulContent(data, philosophy);
    expect(result).not.toContain('## Voice');
  });

  it('includes subspecialty when present', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result).toContain('Spine');
  });

  it('omits subspecialty line when absent', () => {
    const data: CANSDocument = {
      ...validCANSData,
      provider: { ...validCANSData.provider, subspecialty: undefined },
    };
    const result = generateSoulContent(data, philosophy);
    expect(result).not.toContain('subspecialty focus');
  });
});

// ---------------------------------------------------------------------------
// generateAgentsContent
// ---------------------------------------------------------------------------

describe('generateAgentsContent', () => {
  it('includes clinical safety rules section', () => {
    const result = generateAgentsContent(validCANSData);
    expect(result).toContain('## Clinical Safety Rules');
    expect(result).toContain('NEVER provide clinical advice outside Neurosurgery scope');
  });

  it('references correct autonomy tiers for all 7 actions', () => {
    const result = generateAgentsContent(validCANSData);
    expect(result).toContain('Chart=autonomous');
    expect(result).toContain('Order=supervised');
    expect(result).toContain('Charge=supervised');
    expect(result).toContain('Perform=manual');
    expect(result).toContain('Interpret=manual');
    expect(result).toContain('Educate=manual');
    expect(result).toContain('Coordinate=manual');
  });

  it('includes synthetic data warning', () => {
    const result = generateAgentsContent(validCANSData);
    expect(result).toContain('SYNTHETIC DATA ONLY');
  });

  it('includes audit compliance section', () => {
    const result = generateAgentsContent(validCANSData);
    expect(result).toContain('## Audit Compliance');
    expect(result).toContain('append-only and hash-chained');
  });

  it('includes documentation standards section', () => {
    const result = generateAgentsContent(validCANSData);
    expect(result).toContain('## Documentation Standards');
    expect(result).toContain("DRAFT until provider review");
  });
});

// ---------------------------------------------------------------------------
// generateUserContent
// ---------------------------------------------------------------------------

describe('generateUserContent', () => {
  it('includes provider name, types, and specialty', () => {
    const result = generateUserContent(validCANSData);
    expect(result).toContain('Dr. Test Provider');
    expect(result).toContain('Physician');
    expect(result).toContain('Neurosurgery');
  });

  it('includes degrees when present', () => {
    const result = generateUserContent(validCANSData);
    expect(result).toContain('MD');
  });

  it('includes licenses when present', () => {
    const result = generateUserContent(validCANSData);
    expect(result).toContain('MD-TX-A12345');
  });

  it('includes NPI when present', () => {
    const result = generateUserContent(validCANSData);
    expect(result).toContain('NPI: 1234567890');
  });

  it('omits NPI line when absent', () => {
    const data: CANSDocument = {
      ...validCANSData,
      provider: { ...validCANSData.provider, npi: undefined },
    };
    const result = generateUserContent(data);
    expect(result).not.toContain('NPI:');
  });

  it('includes all 7 autonomy preferences', () => {
    const result = generateUserContent(validCANSData);
    expect(result).toContain('Chart autonomy: autonomous');
    expect(result).toContain('Order autonomy: supervised');
    expect(result).toContain('Charge autonomy: supervised');
    expect(result).toContain('Perform autonomy: manual');
    expect(result).toContain('Interpret autonomy: manual');
    expect(result).toContain('Educate autonomy: manual');
    expect(result).toContain('Coordinate autonomy: manual');
  });

  it('includes subspecialty when present', () => {
    const result = generateUserContent(validCANSData);
    expect(result).toContain('Subspecialty: Spine');
  });

  it('omits subspecialty line when absent', () => {
    const data: CANSDocument = {
      ...validCANSData,
      provider: { ...validCANSData.provider, subspecialty: undefined },
    };
    const result = generateUserContent(data);
    expect(result).not.toContain('Subspecialty:');
  });

  it('includes organization when present', () => {
    const result = generateUserContent(validCANSData);
    expect(result).toContain('University Medical Center');
  });

  it('shows "active" as default credential status', () => {
    const data: CANSDocument = {
      ...validCANSData,
      provider: { ...validCANSData.provider, credential_status: undefined },
    };
    const result = generateUserContent(data);
    expect(result).toContain('Credential Status: active');
  });
});

// ---------------------------------------------------------------------------
// All generators: common contract tests
// ---------------------------------------------------------------------------

describe('all generators return valid content', () => {
  it('generateSoulContent returns non-empty string', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('generateAgentsContent returns non-empty string', () => {
    const result = generateAgentsContent(validCANSData);
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('generateUserContent returns non-empty string', () => {
    const result = generateUserContent(validCANSData);
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('generateSoulContent produces no "undefined" or "null" in output', () => {
    const result = generateSoulContent(validCANSData, philosophy);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });

  it('generateAgentsContent produces no "undefined" or "null" in output', () => {
    const result = generateAgentsContent(validCANSData);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });

  it('generateUserContent produces no "undefined" or "null" in output', () => {
    const result = generateUserContent(validCANSData);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });
});
