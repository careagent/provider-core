/**
 * Messaging TypeBox schemas — defines the shape of all outgoing clinical
 * messages sent from provider agents to patient agents.
 *
 * Covers:
 * - MSG-01: Structured clinical message types (clinical_summary, appointment_reminder, care_plan_update)
 * - MSG-02: InjectaVox data input schema (preliminary — Session 08 defines exact format)
 * - MSG-03: Signed message envelope with Ed25519 signature and correlation ID
 *
 * Message types form a TypeBox union matching Session 06d definitions.
 * Every message includes a bilateral correlation ID for cross-system audit matching.
 */

import { Type, type Static } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// InjectaVox Clinical Data (preliminary schema — Session 08 refines)
// ---------------------------------------------------------------------------

export const InjectaVoxDataSchema = Type.Object({
  patient_agent_id: Type.String({ description: 'Target patient agent identifier' }),
  encounter_id: Type.Optional(Type.String({ description: 'Encounter/visit ID' })),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String({ minLength: 1 }),
  timestamp: Type.String({ description: 'ISO 8601 timestamp of data capture' }),
  data_type: Type.Union([
    Type.Literal('encounter_summary'),
    Type.Literal('lab_result'),
    Type.Literal('imaging_result'),
    Type.Literal('medication_change'),
    Type.Literal('diagnosis'),
    Type.Literal('procedure'),
    Type.Literal('care_plan'),
    Type.Literal('appointment'),
    Type.Literal('referral'),
  ]),
  clinical_data: Type.Record(Type.String(), Type.Unknown(), {
    description: 'Structured clinical payload keyed by data type',
  }),
  narrative: Type.Optional(Type.String({ description: 'Human-readable narrative summary' })),
});

export type InjectaVoxData = Static<typeof InjectaVoxDataSchema>;

// ---------------------------------------------------------------------------
// Clinical Summary Message
// ---------------------------------------------------------------------------

export const ClinicalSummarySchema = Type.Object({
  type: Type.Literal('clinical_summary'),
  encounter_id: Type.Optional(Type.String()),
  summary: Type.String({ minLength: 1, description: 'Human-readable clinical summary' }),
  diagnoses: Type.Optional(Type.Array(Type.Object({
    code: Type.String(),
    system: Type.Optional(Type.String()),
    display: Type.String(),
  }))),
  medications: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    dosage: Type.Optional(Type.String()),
    frequency: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
  }))),
  follow_up: Type.Optional(Type.String()),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String({ minLength: 1 }),
});

export type ClinicalSummary = Static<typeof ClinicalSummarySchema>;

// ---------------------------------------------------------------------------
// Appointment Reminder Message
// ---------------------------------------------------------------------------

export const AppointmentReminderSchema = Type.Object({
  type: Type.Literal('appointment_reminder'),
  appointment_id: Type.Optional(Type.String()),
  scheduled_at: Type.String({ description: 'ISO 8601 appointment datetime' }),
  location: Type.Optional(Type.String()),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String({ minLength: 1 }),
  reason: Type.Optional(Type.String()),
  instructions: Type.Optional(Type.String()),
});

export type AppointmentReminder = Static<typeof AppointmentReminderSchema>;

// ---------------------------------------------------------------------------
// Care Plan Update Message
// ---------------------------------------------------------------------------

export const CarePlanUpdateSchema = Type.Object({
  type: Type.Literal('care_plan_update'),
  care_plan_id: Type.Optional(Type.String()),
  summary: Type.String({ minLength: 1, description: 'Summary of care plan changes' }),
  goals: Type.Optional(Type.Array(Type.Object({
    description: Type.String(),
    status: Type.Optional(Type.String()),
    target_date: Type.Optional(Type.String()),
  }))),
  interventions: Type.Optional(Type.Array(Type.Object({
    description: Type.String(),
    assigned_to: Type.Optional(Type.String()),
    frequency: Type.Optional(Type.String()),
  }))),
  provider_npi: Type.String({ pattern: '^[0-9]{10}$' }),
  provider_name: Type.String({ minLength: 1 }),
});

export type CarePlanUpdate = Static<typeof CarePlanUpdateSchema>;

// ---------------------------------------------------------------------------
// Clinical Message Union (Session 06d compatible)
// ---------------------------------------------------------------------------

export const ClinicalMessageSchema = Type.Union([
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
]);

export type ClinicalMessage = Static<typeof ClinicalMessageSchema>;

// ---------------------------------------------------------------------------
// Signed Message Envelope
// ---------------------------------------------------------------------------

export const SignedMessageEnvelopeSchema = Type.Object({
  version: Type.Literal('1'),
  message_id: Type.String({ description: 'UUIDv4 message identifier' }),
  correlation_id: Type.String({ description: 'Bilateral correlation ID for cross-system audit matching' }),
  timestamp: Type.String({ description: 'ISO 8601 send timestamp' }),
  sender_public_key: Type.String({ description: 'base64url-encoded Ed25519 public key' }),
  patient_agent_id: Type.String({ description: 'Target patient agent' }),
  payload: ClinicalMessageSchema,
  signature: Type.String({ description: 'base64url-encoded Ed25519 signature over canonical payload' }),
});

export type SignedMessageEnvelope = Static<typeof SignedMessageEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Message Send Result
// ---------------------------------------------------------------------------

export const MessageSendResultSchema = Type.Object({
  success: Type.Boolean(),
  message_id: Type.String(),
  correlation_id: Type.String(),
  error: Type.Optional(Type.String()),
  error_code: Type.Optional(Type.Union([
    Type.Literal('CONSENT_DENIED'),
    Type.Literal('CONSENT_CHECK_FAILED'),
    Type.Literal('PATIENT_UNREACHABLE'),
    Type.Literal('WEBSOCKET_ERROR'),
    Type.Literal('SIGNING_ERROR'),
    Type.Literal('GENERATION_ERROR'),
    Type.Literal('REFINEMENT_ERROR'),
    Type.Literal('MAX_RETRIES_EXCEEDED'),
  ])),
  attempts: Type.Optional(Type.Number()),
});

export type MessageSendResult = Static<typeof MessageSendResultSchema>;
