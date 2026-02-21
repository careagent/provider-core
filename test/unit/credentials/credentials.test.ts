import { describe, it, expect } from 'vitest';
import { createCredentialValidator } from '../../../src/credentials/validator.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';

// ---------------------------------------------------------------------------
// Helper: makeCANS with sensible defaults and partial overrides
// ---------------------------------------------------------------------------

function makeCANS(overrides?: {
  provider?: Partial<CANSDocument['provider']>;
}): CANSDocument {
  const base: CANSDocument = {
    version: '2.0',
    provider: {
      name: 'Dr. Test',
      types: ['Physician'],
      degrees: ['MD'],
      licenses: ['MD-CA-12345'],
      certifications: ['ABNS Board Certified'],
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

  return base;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCredentialValidator', () => {
  const validator = createCredentialValidator();

  // -----------------------------------------------------------------------
  // Type gating (replaces old license gating)
  // -----------------------------------------------------------------------

  describe('type gating', () => {
    it('Physician provider passes when types requires ["Physician", "Surgeon"]', () => {
      const cans = makeCANS({ provider: { types: ['Physician'] } });
      const result = validator.check(cans, { types: ['Physician', 'Surgeon'] });
      expect(result.valid).toBe(true);
    });

    it('Surgeon provider passes when types requires ["Physician", "Surgeon"]', () => {
      const cans = makeCANS({ provider: { types: ['Surgeon'] } });
      const result = validator.check(cans, { types: ['Physician', 'Surgeon'] });
      expect(result.valid).toBe(true);
    });

    it('NP provider fails when types requires ["Physician", "Surgeon"]', () => {
      const cans = makeCANS({ provider: { types: ['Nurse Practitioner'] } });
      const result = validator.check(cans, { types: ['Physician', 'Surgeon'] });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('type:Physician|Surgeon');
    });

    it('empty types requirement passes any provider', () => {
      const cans = makeCANS({ provider: { types: ['PA'] } });
      const result = validator.check(cans, { types: [] });
      expect(result.valid).toBe(true);
    });

    it('undefined types requirement passes any provider', () => {
      const cans = makeCANS({ provider: { types: ['CRNA'] } });
      const result = validator.check(cans, {});
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // License gating (new: array-based)
  // -----------------------------------------------------------------------

  describe('license gating', () => {
    it('provider with matching license passes', () => {
      const cans = makeCANS({ provider: { licenses: ['MD-CA-12345'] } });
      const result = validator.check(cans, { licenses: ['MD-CA-12345', 'DO-CA-67890'] });
      expect(result.valid).toBe(true);
    });

    it('provider without matching license fails', () => {
      const cans = makeCANS({ provider: { licenses: ['NP-CA-99999'] } });
      const result = validator.check(cans, { licenses: ['MD-CA-12345'] });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('license:MD-CA-12345');
    });

    it('empty licenses requirement passes any provider', () => {
      const cans = makeCANS({ provider: { licenses: ['MD-CA-12345'] } });
      const result = validator.check(cans, { licenses: [] });
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Certification gating
  // -----------------------------------------------------------------------

  describe('certification gating', () => {
    it('provider with matching certification passes', () => {
      const cans = makeCANS({ provider: { certifications: ['ABNS Board Certified'] } });
      const result = validator.check(cans, { certifications: ['ABNS Board Certified'] });
      expect(result.valid).toBe(true);
    });

    it('provider without matching certification fails', () => {
      const cans = makeCANS({ provider: { certifications: ['BLS'] } });
      const result = validator.check(cans, { certifications: ['ABNS Board Certified'] });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('certification:ABNS Board Certified');
    });
  });

  // -----------------------------------------------------------------------
  // Specialty gating
  // -----------------------------------------------------------------------

  describe('specialty gating', () => {
    it('provider with matching specialty passes', () => {
      const cans = makeCANS({ provider: { specialty: 'Neurosurgery' } });
      const result = validator.check(cans, { specialty: ['Neurosurgery', 'Orthopedics'] });
      expect(result.valid).toBe(true);
    });

    it('provider with matching subspecialty passes', () => {
      const cans = makeCANS({
        provider: { specialty: 'General Surgery', subspecialty: 'Spine' },
      });
      const result = validator.check(cans, { specialty: ['Spine', 'Orthopedics'] });
      expect(result.valid).toBe(true);
    });

    it('provider with neither matching specialty nor subspecialty fails', () => {
      const cans = makeCANS({
        provider: { specialty: 'Dermatology', subspecialty: 'Cosmetic' },
      });
      const result = validator.check(cans, { specialty: ['Neurosurgery', 'Orthopedics'] });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('specialty:Neurosurgery|Orthopedics');
    });

    it('provider with no subspecialty and non-matching specialty fails', () => {
      const cans = makeCANS({
        provider: { specialty: 'Dermatology', subspecialty: undefined },
      });
      const result = validator.check(cans, { specialty: ['Neurosurgery'] });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('specialty:Neurosurgery');
    });

    it('empty specialty requirement passes any provider', () => {
      const cans = makeCANS({ provider: { specialty: 'Family Medicine' } });
      const result = validator.check(cans, { specialty: [] });
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Privilege gating (now checks across all organizations)
  // -----------------------------------------------------------------------

  describe('privilege gating', () => {
    it('provider with all required privileges passes', () => {
      const cans = makeCANS();
      const result = validator.check(cans, {
        privilege: ['surgical_procedures', 'craniotomy'],
      });
      expect(result.valid).toBe(true);
    });

    it('provider missing one privilege fails', () => {
      const cans = makeCANS({
        provider: {
          organizations: [
            {
              name: 'University Medical Center',
              privileges: ['surgical_procedures', 'craniotomy'],
              primary: true,
            },
          ],
        },
      });
      const result = validator.check(cans, {
        privilege: ['surgical_procedures', 'craniotomy', 'lumbar_puncture'],
      });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('privilege:lumbar_puncture');
    });

    it('provider missing multiple privileges fails', () => {
      const cans = makeCANS({
        provider: {
          organizations: [
            {
              name: 'Community Hospital',
              privileges: ['chart_review'],
              primary: true,
            },
          ],
        },
      });
      const result = validator.check(cans, {
        privilege: ['surgical_procedures', 'craniotomy', 'spinal_fusion'],
      });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain(
        'privilege:surgical_procedures,craniotomy,spinal_fusion',
      );
    });

    it('empty privilege requirement passes', () => {
      const cans = makeCANS();
      const result = validator.check(cans, { privilege: [] });
      expect(result.valid).toBe(true);
    });

    it('privileges from multiple organizations are aggregated', () => {
      const cans = makeCANS({
        provider: {
          organizations: [
            { name: 'Hospital A', privileges: ['surgical_procedures'], primary: true },
            { name: 'Hospital B', privileges: ['craniotomy', 'spinal_fusion'] },
          ],
        },
      });
      const result = validator.check(cans, {
        privilege: ['surgical_procedures', 'craniotomy', 'spinal_fusion'],
      });
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Combined checks
  // -----------------------------------------------------------------------

  describe('combined checks', () => {
    it('provider failing multiple dimensions lists all missing credentials', () => {
      const cans = makeCANS({
        provider: {
          types: ['Nurse Practitioner'],
          licenses: ['NP-CA-99999'],
          certifications: ['BLS'],
          specialty: 'Family Medicine',
          subspecialty: undefined,
          organizations: [
            { name: 'Community Clinic', privileges: ['chart_review'], primary: true },
          ],
        },
      });
      const result = validator.check(cans, {
        types: ['Physician'],
        specialty: ['Neurosurgery'],
        privilege: ['craniotomy'],
      });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toHaveLength(3);
      expect(result.missingCredentials).toContain('type:Physician');
      expect(result.missingCredentials).toContain('specialty:Neurosurgery');
      expect(result.missingCredentials).toContain('privilege:craniotomy');
    });

    it('provider passing all dimensions returns valid with no missingCredentials/reason', () => {
      const cans = makeCANS();
      const result = validator.check(cans, {
        types: ['Physician'],
        specialty: ['Neurosurgery', 'Spine'],
        privilege: ['surgical_procedures', 'craniotomy'],
      });
      expect(result.valid).toBe(true);
      expect(result).not.toHaveProperty('missingCredentials');
      expect(result).not.toHaveProperty('reason');
    });

    it('all dimensions empty/undefined = valid (regular skill scenario)', () => {
      const cans = makeCANS();
      const result = validator.check(cans, {});
      expect(result.valid).toBe(true);
    });

    it('all dimensions empty arrays = valid (regular skill scenario)', () => {
      const cans = makeCANS();
      const result = validator.check(cans, {
        types: [],
        licenses: [],
        certifications: [],
        specialty: [],
        privilege: [],
      });
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Return value shape
  // -----------------------------------------------------------------------

  describe('return value shape', () => {
    it('valid result has provider name, types, licenses, certifications, specialty', () => {
      const cans = makeCANS();
      const result = validator.check(cans, {});
      expect(result.provider).toBe('Dr. Test');
      expect(result.types).toEqual(['Physician']);
      expect(result.licenses).toEqual(['MD-CA-12345']);
      expect(result.certifications).toEqual(['ABNS Board Certified']);
      expect(result.specialty).toBe('Neurosurgery');
    });

    it('invalid result has missingCredentials array and reason string', () => {
      const cans = makeCANS({ provider: { types: ['Nurse Practitioner'] } });
      const result = validator.check(cans, { types: ['Physician'] });
      expect(result.valid).toBe(false);
      expect(Array.isArray(result.missingCredentials)).toBe(true);
      expect(typeof result.reason).toBe('string');
      expect(result.reason).toContain('Dr. Test');
      expect(result.reason).toContain('type:Physician');
    });

    it('valid result does NOT have missingCredentials or reason properties', () => {
      const cans = makeCANS();
      const result = validator.check(cans, { types: ['Physician'] });
      expect(result.valid).toBe(true);
      const keys = Object.keys(result);
      expect(keys).not.toContain('missingCredentials');
      expect(keys).not.toContain('reason');
    });
  });
});
