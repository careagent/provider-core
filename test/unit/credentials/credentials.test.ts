import { describe, it, expect } from 'vitest';
import { createCredentialValidator } from '../../../src/credentials/validator.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';

// ---------------------------------------------------------------------------
// Helper: makeCANS with sensible defaults and partial overrides
// ---------------------------------------------------------------------------

function makeCANS(overrides?: {
  provider?: Partial<CANSDocument['provider']> & {
    license?: Partial<CANSDocument['provider']['license']>;
  };
}): CANSDocument {
  const base: CANSDocument = {
    version: '1.0.0',
    provider: {
      name: 'Dr. Test',
      license: {
        type: 'MD',
        state: 'CA',
        number: '12345',
        verified: false,
      },
      specialty: 'Neurosurgery',
      subspecialty: 'Spine',
      privileges: ['surgical_procedures', 'craniotomy', 'spinal_fusion'],
    },
    scope: {
      permitted_actions: ['chart_review', 'documentation'],
    },
    autonomy: {
      chart: 'autonomous',
      order: 'supervised',
      charge: 'manual',
      perform: 'manual',
    },
    hardening: {
      tool_policy_lockdown: true,
      exec_approval: true,
      cans_protocol_injection: true,
      docker_sandbox: false,
      safety_guard: true,
      audit_trail: true,
    },
    consent: {
      hipaa_warning_acknowledged: true,
      synthetic_data_only: true,
      audit_consent: true,
    },
  };

  if (overrides?.provider) {
    const { license, ...providerRest } = overrides.provider;
    Object.assign(base.provider, providerRest);
    if (license) {
      Object.assign(base.provider.license, license);
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCredentialValidator', () => {
  const validator = createCredentialValidator();

  // -----------------------------------------------------------------------
  // License gating
  // -----------------------------------------------------------------------

  describe('license gating', () => {
    it('MD provider passes when license requires ["MD", "DO"]', () => {
      const cans = makeCANS({ provider: { license: { type: 'MD' } } });
      const result = validator.check(cans, { license: ['MD', 'DO'] });
      expect(result.valid).toBe(true);
    });

    it('DO provider passes when license requires ["MD", "DO"]', () => {
      const cans = makeCANS({ provider: { license: { type: 'DO' } } });
      const result = validator.check(cans, { license: ['MD', 'DO'] });
      expect(result.valid).toBe(true);
    });

    it('NP provider fails when license requires ["MD", "DO"]', () => {
      const cans = makeCANS({ provider: { license: { type: 'NP' } } });
      const result = validator.check(cans, { license: ['MD', 'DO'] });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('license:MD|DO');
    });

    it('empty license requirement passes any provider', () => {
      const cans = makeCANS({ provider: { license: { type: 'PA' } } });
      const result = validator.check(cans, { license: [] });
      expect(result.valid).toBe(true);
    });

    it('undefined license requirement passes any provider', () => {
      const cans = makeCANS({ provider: { license: { type: 'CRNA' } } });
      const result = validator.check(cans, {});
      expect(result.valid).toBe(true);
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
  // Privilege gating
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
        provider: { privileges: ['surgical_procedures', 'craniotomy'] },
      });
      const result = validator.check(cans, {
        privilege: ['surgical_procedures', 'craniotomy', 'lumbar_puncture'],
      });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toContain('privilege:lumbar_puncture');
    });

    it('provider missing multiple privileges fails', () => {
      const cans = makeCANS({
        provider: { privileges: ['chart_review'] },
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
  });

  // -----------------------------------------------------------------------
  // Combined checks
  // -----------------------------------------------------------------------

  describe('combined checks', () => {
    it('provider failing multiple dimensions lists all missing credentials', () => {
      const cans = makeCANS({
        provider: {
          license: { type: 'NP' },
          specialty: 'Family Medicine',
          subspecialty: undefined,
          privileges: ['chart_review'],
        },
      });
      const result = validator.check(cans, {
        license: ['MD', 'DO'],
        specialty: ['Neurosurgery'],
        privilege: ['craniotomy'],
      });
      expect(result.valid).toBe(false);
      expect(result.missingCredentials).toHaveLength(3);
      expect(result.missingCredentials).toContain('license:MD|DO');
      expect(result.missingCredentials).toContain('specialty:Neurosurgery');
      expect(result.missingCredentials).toContain('privilege:craniotomy');
    });

    it('provider passing all dimensions returns valid with no missingCredentials/reason', () => {
      const cans = makeCANS();
      const result = validator.check(cans, {
        license: ['MD', 'DO'],
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
        license: [],
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
    it('valid result has provider name, licenseType, specialty', () => {
      const cans = makeCANS();
      const result = validator.check(cans, {});
      expect(result.provider).toBe('Dr. Test');
      expect(result.licenseType).toBe('MD');
      expect(result.specialty).toBe('Neurosurgery');
    });

    it('invalid result has missingCredentials array and reason string', () => {
      const cans = makeCANS({ provider: { license: { type: 'NP' } } });
      const result = validator.check(cans, { license: ['MD'] });
      expect(result.valid).toBe(false);
      expect(Array.isArray(result.missingCredentials)).toBe(true);
      expect(typeof result.reason).toBe('string');
      expect(result.reason).toContain('Dr. Test');
      expect(result.reason).toContain('license:MD');
    });

    it('valid result does NOT have missingCredentials or reason properties', () => {
      const cans = makeCANS();
      const result = validator.check(cans, { license: ['MD'] });
      expect(result.valid).toBe(true);
      const keys = Object.keys(result);
      expect(keys).not.toContain('missingCredentials');
      expect(keys).not.toContain('reason');
    });
  });
});
