import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  InjectaVoxDataSchema,
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
  ClinicalMessageSchema,
  SignedMessageEnvelopeSchema,
  MessageSendResultSchema,
} from '../../../src/messaging/schemas.js';

// ---------------------------------------------------------------------------
// InjectaVoxDataSchema
// ---------------------------------------------------------------------------

describe('InjectaVoxDataSchema', () => {
  it('validates a valid encounter_summary', () => {
    const data = {
      patient_agent_id: 'patient-001',
      encounter_id: 'enc-001',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
      timestamp: '2026-02-28T10:00:00Z',
      data_type: 'encounter_summary',
      clinical_data: { diagnoses: [], medications: [] },
    };
    expect(Value.Check(InjectaVoxDataSchema, data)).toBe(true);
  });

  it('validates all data_type variants', () => {
    const types = [
      'encounter_summary', 'lab_result', 'imaging_result', 'medication_change',
      'diagnosis', 'procedure', 'care_plan', 'appointment', 'referral',
    ];
    for (const dt of types) {
      const data = {
        patient_agent_id: 'p-1',
        provider_npi: '1234567893',
        provider_name: 'Dr. Test',
        timestamp: '2026-01-01T00:00:00Z',
        data_type: dt,
        clinical_data: {},
      };
      expect(Value.Check(InjectaVoxDataSchema, data)).toBe(true);
    }
  });

  it('rejects missing required fields', () => {
    const invalid = {
      patient_agent_id: 'p-1',
      data_type: 'lab_result',
    };
    expect(Value.Check(InjectaVoxDataSchema, invalid)).toBe(false);
  });

  it('rejects invalid data_type', () => {
    const data = {
      patient_agent_id: 'p-1',
      provider_npi: '1234567893',
      provider_name: 'Dr. Test',
      timestamp: '2026-01-01T00:00:00Z',
      data_type: 'unknown_type',
      clinical_data: {},
    };
    expect(Value.Check(InjectaVoxDataSchema, data)).toBe(false);
  });

  it('rejects invalid NPI format', () => {
    const data = {
      patient_agent_id: 'p-1',
      provider_npi: '123',
      provider_name: 'Dr. Test',
      timestamp: '2026-01-01T00:00:00Z',
      data_type: 'lab_result',
      clinical_data: {},
    };
    expect(Value.Check(InjectaVoxDataSchema, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ClinicalSummarySchema
// ---------------------------------------------------------------------------

describe('ClinicalSummarySchema', () => {
  it('validates a minimal clinical summary', () => {
    const msg = {
      type: 'clinical_summary',
      summary: 'Patient seen for follow-up',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(true);
  });

  it('validates with optional fields', () => {
    const msg = {
      type: 'clinical_summary',
      encounter_id: 'enc-001',
      summary: 'Patient seen for follow-up',
      diagnoses: [{ code: 'J06.9', system: 'ICD-10', display: 'URI' }],
      medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TID' }],
      follow_up: 'Return in 2 weeks',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(true);
  });

  it('rejects wrong type literal', () => {
    const msg = {
      type: 'appointment_reminder',
      summary: 'test',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(false);
  });

  it('rejects empty summary', () => {
    const msg = {
      type: 'clinical_summary',
      summary: '',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalSummarySchema, msg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AppointmentReminderSchema
// ---------------------------------------------------------------------------

describe('AppointmentReminderSchema', () => {
  it('validates a minimal appointment reminder', () => {
    const msg = {
      type: 'appointment_reminder',
      scheduled_at: '2026-03-15T09:00:00Z',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(AppointmentReminderSchema, msg)).toBe(true);
  });

  it('validates with all optional fields', () => {
    const msg = {
      type: 'appointment_reminder',
      appointment_id: 'appt-001',
      scheduled_at: '2026-03-15T09:00:00Z',
      location: 'Clinic B, Room 3',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
      reason: 'Annual physical',
      instructions: 'Fast for 12 hours before appointment',
    };
    expect(Value.Check(AppointmentReminderSchema, msg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CarePlanUpdateSchema
// ---------------------------------------------------------------------------

describe('CarePlanUpdateSchema', () => {
  it('validates a minimal care plan update', () => {
    const msg = {
      type: 'care_plan_update',
      summary: 'Updated medication regimen',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(CarePlanUpdateSchema, msg)).toBe(true);
  });

  it('validates with goals and interventions', () => {
    const msg = {
      type: 'care_plan_update',
      care_plan_id: 'cp-001',
      summary: 'Updated care plan',
      goals: [
        { description: 'Reduce A1C to < 7%', status: 'active', target_date: '2026-06-01' },
      ],
      interventions: [
        { description: 'Daily blood glucose monitoring', frequency: 'daily' },
      ],
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(CarePlanUpdateSchema, msg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ClinicalMessageSchema (union)
// ---------------------------------------------------------------------------

describe('ClinicalMessageSchema', () => {
  it('accepts clinical_summary', () => {
    const msg = {
      type: 'clinical_summary',
      summary: 'test',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalMessageSchema, msg)).toBe(true);
  });

  it('accepts appointment_reminder', () => {
    const msg = {
      type: 'appointment_reminder',
      scheduled_at: '2026-03-15T09:00:00Z',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalMessageSchema, msg)).toBe(true);
  });

  it('accepts care_plan_update', () => {
    const msg = {
      type: 'care_plan_update',
      summary: 'test',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalMessageSchema, msg)).toBe(true);
  });

  it('rejects unknown message type', () => {
    const msg = {
      type: 'unknown_type',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };
    expect(Value.Check(ClinicalMessageSchema, msg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SignedMessageEnvelopeSchema
// ---------------------------------------------------------------------------

describe('SignedMessageEnvelopeSchema', () => {
  it('validates a valid signed envelope', () => {
    const envelope = {
      version: '1',
      message_id: 'msg-001',
      correlation_id: 'corr-001',
      timestamp: '2026-02-28T10:00:00Z',
      sender_public_key: 'abc123',
      patient_agent_id: 'patient-001',
      payload: {
        type: 'clinical_summary',
        summary: 'test summary',
        provider_npi: '1234567893',
        provider_name: 'Dr. Smith',
      },
      signature: 'sig-base64url',
    };
    expect(Value.Check(SignedMessageEnvelopeSchema, envelope)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MessageSendResultSchema
// ---------------------------------------------------------------------------

describe('MessageSendResultSchema', () => {
  it('validates a success result', () => {
    const result = {
      success: true,
      message_id: 'msg-001',
      correlation_id: 'corr-001',
    };
    expect(Value.Check(MessageSendResultSchema, result)).toBe(true);
  });

  it('validates a failure result with error code', () => {
    const result = {
      success: false,
      message_id: 'msg-001',
      correlation_id: 'corr-001',
      error: 'Consent denied',
      error_code: 'CONSENT_DENIED',
      attempts: 1,
    };
    expect(Value.Check(MessageSendResultSchema, result)).toBe(true);
  });

  it('validates all error codes', () => {
    const codes = [
      'CONSENT_DENIED', 'CONSENT_CHECK_FAILED', 'PATIENT_UNREACHABLE',
      'WEBSOCKET_ERROR', 'SIGNING_ERROR', 'GENERATION_ERROR',
      'REFINEMENT_ERROR', 'MAX_RETRIES_EXCEEDED',
    ];
    for (const code of codes) {
      const result = {
        success: false,
        message_id: 'msg-001',
        correlation_id: 'corr-001',
        error_code: code,
      };
      expect(Value.Check(MessageSendResultSchema, result)).toBe(true);
    }
  });
});
