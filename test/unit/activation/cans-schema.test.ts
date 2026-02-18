import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { CANSSchema } from '../../../src/activation/cans-schema.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';

describe('CANSSchema', () => {
  it('validates a complete valid CANS document', () => {
    expect(Value.Check(CANSSchema, validCANSData)).toBe(true);
  });

  it('validates without optional clinical_voice', () => {
    const data = { ...validCANSData };
    // clinical_voice is not set — should still pass
    expect(Value.Check(CANSSchema, data)).toBe(true);
  });

  it('validates with clinical_voice present', () => {
    const data = {
      ...validCANSData,
      clinical_voice: {
        tone: 'direct',
        documentation_style: 'structured',
        eponyms: true,
        abbreviations: 'standard',
      },
    };
    expect(Value.Check(CANSSchema, data)).toBe(true);
  });

  it('validates without optional provider.npi', () => {
    const data = structuredClone(validCANSData);
    delete (data.provider as Record<string, unknown>).npi;
    expect(Value.Check(CANSSchema, data)).toBe(true);
  });

  describe('provider validation', () => {
    it('rejects missing provider.name', () => {
      const data = structuredClone(validCANSData);
      delete (data.provider as Record<string, unknown>).name;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects empty provider.name', () => {
      const data = structuredClone(validCANSData);
      data.provider.name = '';
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects invalid license type', () => {
      const data = structuredClone(validCANSData);
      (data.provider.license as Record<string, unknown>).type = 'RN';
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects state that is too long', () => {
      const data = structuredClone(validCANSData);
      data.provider.license.state = 'California';
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects state that is too short', () => {
      const data = structuredClone(validCANSData);
      data.provider.license.state = 'T';
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects invalid NPI format (too short)', () => {
      const data = structuredClone(validCANSData);
      data.provider.npi = '123';
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects invalid NPI format (non-numeric)', () => {
      const data = structuredClone(validCANSData);
      data.provider.npi = 'ABCDEFGHIJ';
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects empty privileges array', () => {
      const data = structuredClone(validCANSData);
      data.provider.privileges = [];
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });
  });

  describe('scope validation', () => {
    it('rejects missing permitted_actions', () => {
      const data = structuredClone(validCANSData);
      delete (data.scope as Record<string, unknown>).permitted_actions;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects empty permitted_actions', () => {
      const data = structuredClone(validCANSData);
      data.scope.permitted_actions = [];
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });
  });

  describe('autonomy validation', () => {
    it('rejects missing autonomy.chart', () => {
      const data = structuredClone(validCANSData);
      delete (data.autonomy as Record<string, unknown>).chart;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects invalid autonomy tier value', () => {
      const data = structuredClone(validCANSData);
      (data.autonomy as Record<string, unknown>).chart = 'auto';
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing autonomy.order', () => {
      const data = structuredClone(validCANSData);
      delete (data.autonomy as Record<string, unknown>).order;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });
  });

  describe('hardening validation', () => {
    it('rejects missing hardening fields', () => {
      const data = structuredClone(validCANSData);
      delete (data.hardening as Record<string, unknown>).tool_policy_lockdown;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });
  });

  describe('consent validation', () => {
    it('rejects missing consent fields', () => {
      const data = structuredClone(validCANSData);
      delete (data.consent as Record<string, unknown>).hipaa_warning_acknowledged;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });
  });

  describe('error reporting', () => {
    it('returns error objects with path for invalid data', () => {
      const invalidData = structuredClone(validCANSData);
      delete (invalidData.provider as Record<string, unknown>).name;
      (invalidData.autonomy as Record<string, unknown>).chart = 'auto';

      const errors = [...Value.Errors(CANSSchema, invalidData)];
      expect(errors.length).toBeGreaterThan(0);

      // Each error should have a path property
      for (const error of errors) {
        expect(error).toHaveProperty('path');
        expect(error).toHaveProperty('message');
      }

      // Verify specific paths are reported
      const paths = errors.map((e) => e.path);
      expect(paths.some((p) => p.includes('/provider'))).toBe(true);
      expect(paths.some((p) => p.includes('/autonomy'))).toBe(true);
    });
  });
});
