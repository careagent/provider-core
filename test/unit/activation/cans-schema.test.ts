import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { CANSSchema } from '../../../src/activation/cans-schema.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';

describe('CANSSchema', () => {
  it('validates a complete valid CANS document', () => {
    expect(Value.Check(CANSSchema, validCANSData)).toBe(true);
  });

  it('validates without optional voice', () => {
    const data = { ...validCANSData };
    // voice is not set — should still pass
    expect(Value.Check(CANSSchema, data)).toBe(true);
  });

  it('validates with voice present', () => {
    const data = {
      ...validCANSData,
      voice: {
        chart: 'direct, structured operative notes',
        order: 'formal order entry language',
        interpret: 'concise radiology reads',
      },
    };
    expect(Value.Check(CANSSchema, data)).toBe(true);
  });

  it('validates with voice containing all seven fields', () => {
    const data = {
      ...validCANSData,
      voice: {
        chart: 'structured',
        order: 'formal',
        charge: 'billing-precise',
        perform: 'step-by-step',
        interpret: 'concise',
        educate: 'patient-friendly',
        coordinate: 'interdisciplinary',
      },
    };
    expect(Value.Check(CANSSchema, data)).toBe(true);
  });

  it('validates without optional provider.npi', () => {
    const data = structuredClone(validCANSData);
    delete (data.provider as Record<string, unknown>).npi;
    expect(Value.Check(CANSSchema, data)).toBe(true);
  });

  it('validates without optional provider.specialty', () => {
    const data = structuredClone(validCANSData);
    delete (data.provider as Record<string, unknown>).specialty;
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

    it('rejects empty provider.types array (minItems: 1)', () => {
      const data = structuredClone(validCANSData);
      data.provider.types = [];
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('accepts provider with multiple types', () => {
      const data = structuredClone(validCANSData);
      data.provider.types = ['Physician', 'Surgeon'];
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts provider with multiple degrees', () => {
      const data = structuredClone(validCANSData);
      data.provider.degrees = ['MD', 'PhD'];
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts provider with empty degrees array', () => {
      const data = structuredClone(validCANSData);
      data.provider.degrees = [];
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts provider with empty licenses array', () => {
      const data = structuredClone(validCANSData);
      data.provider.licenses = [];
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts provider with empty certifications array', () => {
      const data = structuredClone(validCANSData);
      data.provider.certifications = [];
      expect(Value.Check(CANSSchema, data)).toBe(true);
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

    it('rejects empty organizations array (minItems: 1)', () => {
      const data = structuredClone(validCANSData);
      data.provider.organizations = [];
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('accepts organization with only name (minimal)', () => {
      const data = structuredClone(validCANSData);
      data.provider.organizations = [{ name: 'General Hospital', primary: true }];
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('rejects organization with empty name', () => {
      const data = structuredClone(validCANSData);
      data.provider.organizations = [{ name: '', primary: true }];
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('accepts organization with department and neuron fields', () => {
      const data = structuredClone(validCANSData);
      data.provider.organizations = [
        {
          name: 'University Medical Center',
          department: 'Neurosurgery',
          privileges: ['neurosurgical procedures'],
          neuron_endpoint: 'https://neuron.example.com',
          neuron_registration_id: 'reg-123',
          primary: true,
        },
      ];
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts multiple organizations', () => {
      const data = structuredClone(validCANSData);
      data.provider.organizations = [
        { name: 'University Medical Center', primary: true },
        { name: 'Community Hospital', primary: false },
      ];
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts valid credential_status values', () => {
      for (const status of ['active', 'pending', 'expired'] as const) {
        const data = structuredClone(validCANSData);
        data.provider.credential_status = status;
        expect(Value.Check(CANSSchema, data)).toBe(true);
      }
    });

    it('rejects invalid credential_status value', () => {
      const data = structuredClone(validCANSData);
      (data.provider as Record<string, unknown>).credential_status = 'revoked';
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

    it('accepts scope with only permitted_actions (no prohibited/limitations)', () => {
      const data = structuredClone(validCANSData);
      data.scope = { permitted_actions: ['chart_operative_note'] };
      expect(Value.Check(CANSSchema, data)).toBe(true);
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

    it('rejects missing autonomy.charge', () => {
      const data = structuredClone(validCANSData);
      delete (data.autonomy as Record<string, unknown>).charge;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing autonomy.perform', () => {
      const data = structuredClone(validCANSData);
      delete (data.autonomy as Record<string, unknown>).perform;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing autonomy.interpret', () => {
      const data = structuredClone(validCANSData);
      delete (data.autonomy as Record<string, unknown>).interpret;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing autonomy.educate', () => {
      const data = structuredClone(validCANSData);
      delete (data.autonomy as Record<string, unknown>).educate;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing autonomy.coordinate', () => {
      const data = structuredClone(validCANSData);
      delete (data.autonomy as Record<string, unknown>).coordinate;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('accepts all valid tier values for each action', () => {
      for (const tier of ['autonomous', 'supervised', 'manual'] as const) {
        const data = structuredClone(validCANSData);
        data.autonomy.chart = tier;
        data.autonomy.order = tier;
        data.autonomy.charge = tier;
        data.autonomy.perform = tier;
        data.autonomy.interpret = tier;
        data.autonomy.educate = tier;
        data.autonomy.coordinate = tier;
        expect(Value.Check(CANSSchema, data)).toBe(true);
      }
    });
  });

  describe('consent validation', () => {
    it('rejects missing hipaa_warning_acknowledged', () => {
      const data = structuredClone(validCANSData);
      delete (data.consent as Record<string, unknown>).hipaa_warning_acknowledged;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing acknowledged_at', () => {
      const data = structuredClone(validCANSData);
      delete (data.consent as Record<string, unknown>).acknowledged_at;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing synthetic_data_only', () => {
      const data = structuredClone(validCANSData);
      delete (data.consent as Record<string, unknown>).synthetic_data_only;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects missing audit_consent', () => {
      const data = structuredClone(validCANSData);
      delete (data.consent as Record<string, unknown>).audit_consent;
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('accepts valid ISO 8601 timestamp for acknowledged_at', () => {
      const data = structuredClone(validCANSData);
      data.consent.acknowledged_at = '2026-02-21T12:30:00.000Z';
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });
  });

  describe('skills validation', () => {
    it('accepts skills with empty authorized array', () => {
      const data = structuredClone(validCANSData);
      data.skills = { authorized: [] };
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts skills with authorized skill IDs', () => {
      const data = structuredClone(validCANSData);
      data.skills = { authorized: ['chart-skill', 'order-skill'] };
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('rejects skills without authorized field', () => {
      const data = structuredClone(validCANSData);
      (data as Record<string, unknown>).skills = {};
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects skills with authorized containing empty string', () => {
      const data = structuredClone(validCANSData);
      data.skills = { authorized: ['chart-skill', ''] };
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });
  });

  describe('cross_installation validation', () => {
    it('accepts valid CANS data without cross_installation field', () => {
      expect(Value.Check(CANSSchema, validCANSData)).toBe(true);
    });

    it('accepts valid cross_installation consent', () => {
      const data = {
        ...validCANSData,
        cross_installation: {
          allow_inbound: true,
          allow_outbound: false,
        },
      };
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('rejects cross_installation missing allow_inbound', () => {
      const data = {
        ...validCANSData,
        cross_installation: { allow_outbound: true },
      };
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });

    it('rejects cross_installation missing allow_outbound', () => {
      const data = {
        ...validCANSData,
        cross_installation: { allow_inbound: true },
      };
      expect(Value.Check(CANSSchema, data)).toBe(false);
    });
  });

  describe('voice validation', () => {
    it('accepts voice with subset of fields', () => {
      const data = {
        ...validCANSData,
        voice: { chart: 'structured operative notes' },
      };
      expect(Value.Check(CANSSchema, data)).toBe(true);
    });

    it('accepts empty voice object (all fields optional)', () => {
      const data = {
        ...validCANSData,
        voice: {},
      };
      expect(Value.Check(CANSSchema, data)).toBe(true);
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
