import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { generateMessage } from '../../../src/messaging/generator.js';
import {
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
  type InjectaVoxData,
} from '../../../src/messaging/schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInjectaVoxData(
  overrides: Partial<InjectaVoxData> = {},
): InjectaVoxData {
  return {
    patient_agent_id: 'patient-001',
    encounter_id: 'enc-001',
    provider_npi: '1234567893',
    provider_name: 'Dr. Smith',
    timestamp: '2026-02-28T10:00:00Z',
    data_type: 'encounter_summary',
    clinical_data: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Clinical Summary generation
// ---------------------------------------------------------------------------

describe('generateMessage', () => {
  describe('clinical_summary generation', () => {
    it('generates from encounter_summary data', () => {
      const data = makeInjectaVoxData({
        data_type: 'encounter_summary',
        narrative: 'Patient seen for routine follow-up',
        clinical_data: {
          diagnoses: [{ code: 'J06.9', display: 'Upper respiratory infection' }],
          medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TID' }],
          follow_up: 'Return in 2 weeks',
        },
      });

      const msg = generateMessage(data);
      expect(msg.type).toBe('clinical_summary');
      expect(Value.Check(ClinicalSummarySchema, msg)).toBe(true);

      if (msg.type === 'clinical_summary') {
        expect(msg.summary).toBe('Patient seen for routine follow-up');
        expect(msg.diagnoses).toHaveLength(1);
        expect(msg.diagnoses![0].code).toBe('J06.9');
        expect(msg.medications).toHaveLength(1);
        expect(msg.follow_up).toBe('Return in 2 weeks');
        expect(msg.provider_npi).toBe('1234567893');
        expect(msg.provider_name).toBe('Dr. Smith');
        expect(msg.encounter_id).toBe('enc-001');
      }
    });

    it('generates from lab_result data', () => {
      const msg = generateMessage(makeInjectaVoxData({ data_type: 'lab_result' }));
      expect(msg.type).toBe('clinical_summary');
      expect(Value.Check(ClinicalSummarySchema, msg)).toBe(true);
    });

    it('generates from imaging_result data', () => {
      const msg = generateMessage(makeInjectaVoxData({ data_type: 'imaging_result' }));
      expect(msg.type).toBe('clinical_summary');
    });

    it('generates from medication_change data', () => {
      const msg = generateMessage(makeInjectaVoxData({ data_type: 'medication_change' }));
      expect(msg.type).toBe('clinical_summary');
    });

    it('generates from diagnosis data', () => {
      const msg = generateMessage(makeInjectaVoxData({ data_type: 'diagnosis' }));
      expect(msg.type).toBe('clinical_summary');
    });

    it('generates from procedure data', () => {
      const msg = generateMessage(makeInjectaVoxData({ data_type: 'procedure' }));
      expect(msg.type).toBe('clinical_summary');
    });

    it('generates from referral data', () => {
      const msg = generateMessage(makeInjectaVoxData({ data_type: 'referral' }));
      expect(msg.type).toBe('clinical_summary');
    });

    it('builds a default narrative when none provided', () => {
      const data = makeInjectaVoxData({
        data_type: 'encounter_summary',
        narrative: undefined,
        clinical_data: {},
      });

      const msg = generateMessage(data);
      if (msg.type === 'clinical_summary') {
        expect(msg.summary).toContain('Dr. Smith');
        expect(msg.summary).toContain('1234567893');
      }
    });

    it('handles diagnoses with optional system field', () => {
      const data = makeInjectaVoxData({
        clinical_data: {
          diagnoses: [
            { code: 'E11.9', display: 'Type 2 DM' },
            { code: 'I10', system: 'ICD-10', display: 'Hypertension' },
          ],
        },
      });

      const msg = generateMessage(data);
      if (msg.type === 'clinical_summary') {
        expect(msg.diagnoses).toHaveLength(2);
        expect(msg.diagnoses![0].system).toBeUndefined();
        expect(msg.diagnoses![1].system).toBe('ICD-10');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Appointment reminder generation
  // -------------------------------------------------------------------------

  describe('appointment_reminder generation', () => {
    it('generates from appointment data', () => {
      const data = makeInjectaVoxData({
        data_type: 'appointment',
        clinical_data: {
          appointment_id: 'appt-001',
          scheduled_at: '2026-03-15T09:00:00Z',
          location: 'Clinic B',
          reason: 'Annual physical',
          instructions: 'Fast for 12 hours',
        },
      });

      const msg = generateMessage(data);
      expect(msg.type).toBe('appointment_reminder');
      expect(Value.Check(AppointmentReminderSchema, msg)).toBe(true);

      if (msg.type === 'appointment_reminder') {
        expect(msg.appointment_id).toBe('appt-001');
        expect(msg.scheduled_at).toBe('2026-03-15T09:00:00Z');
        expect(msg.location).toBe('Clinic B');
        expect(msg.reason).toBe('Annual physical');
        expect(msg.instructions).toBe('Fast for 12 hours');
      }
    });

    it('uses data timestamp as fallback for scheduled_at', () => {
      const data = makeInjectaVoxData({
        data_type: 'appointment',
        clinical_data: {},
      });

      const msg = generateMessage(data);
      if (msg.type === 'appointment_reminder') {
        expect(msg.scheduled_at).toBe('2026-02-28T10:00:00Z');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Care plan update generation
  // -------------------------------------------------------------------------

  describe('care_plan_update generation', () => {
    it('generates from care_plan data', () => {
      const data = makeInjectaVoxData({
        data_type: 'care_plan',
        narrative: 'Updated diabetes care plan',
        clinical_data: {
          care_plan_id: 'cp-001',
          goals: [
            { description: 'A1C < 7%', status: 'active', target_date: '2026-06-01' },
          ],
          interventions: [
            { description: 'Daily glucose monitoring', frequency: 'daily' },
          ],
        },
      });

      const msg = generateMessage(data);
      expect(msg.type).toBe('care_plan_update');
      expect(Value.Check(CarePlanUpdateSchema, msg)).toBe(true);

      if (msg.type === 'care_plan_update') {
        expect(msg.care_plan_id).toBe('cp-001');
        expect(msg.summary).toBe('Updated diabetes care plan');
        expect(msg.goals).toHaveLength(1);
        expect(msg.interventions).toHaveLength(1);
      }
    });

    it('uses clinical_data.summary as fallback', () => {
      const data = makeInjectaVoxData({
        data_type: 'care_plan',
        narrative: undefined,
        clinical_data: { summary: 'Plan changed' },
      });

      const msg = generateMessage(data);
      if (msg.type === 'care_plan_update') {
        expect(msg.summary).toBe('Plan changed');
      }
    });

    it('uses default summary when none available', () => {
      const data = makeInjectaVoxData({
        data_type: 'care_plan',
        narrative: undefined,
        clinical_data: {},
      });

      const msg = generateMessage(data);
      if (msg.type === 'care_plan_update') {
        expect(msg.summary).toBe('Care plan updated');
      }
    });
  });
});
