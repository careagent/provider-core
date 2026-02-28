/**
 * Message generator — transforms InjectaVox clinical data into structured
 * clinical messages (clinical_summary, appointment_reminder, care_plan_update).
 *
 * Covers:
 * - MSG-01: Transform InjectaVox data into structured clinical summary messages
 * - MSG-02: Support three message types matching Session 06d
 *
 * Each generator function maps InjectaVox fields to the corresponding
 * clinical message schema. No PHI leaks outside the message pipeline.
 */

import type {
  InjectaVoxData,
  ClinicalSummary,
  AppointmentReminder,
  CarePlanUpdate,
  ClinicalMessage,
} from './schemas.js';

/**
 * Generate a clinical message from InjectaVox data.
 *
 * Routes to the appropriate generator based on data_type:
 * - encounter_summary, lab_result, imaging_result, medication_change,
 *   diagnosis, procedure → clinical_summary
 * - appointment → appointment_reminder
 * - care_plan → care_plan_update
 * - referral → clinical_summary (as referral summary)
 *
 * @param data - InjectaVox clinical data
 * @returns The structured clinical message
 */
export function generateMessage(data: InjectaVoxData): ClinicalMessage {
  switch (data.data_type) {
    case 'encounter_summary':
    case 'lab_result':
    case 'imaging_result':
    case 'medication_change':
    case 'diagnosis':
    case 'procedure':
    case 'referral':
      return generateClinicalSummary(data);
    case 'appointment':
      return generateAppointmentReminder(data);
    case 'care_plan':
      return generateCarePlanUpdate(data);
  }
}

/**
 * Generate a clinical summary from InjectaVox data.
 */
function generateClinicalSummary(data: InjectaVoxData): ClinicalSummary {
  const clinical = data.clinical_data;

  const summary: ClinicalSummary = {
    type: 'clinical_summary',
    encounter_id: data.encounter_id,
    summary: data.narrative || buildSummaryNarrative(data),
    provider_npi: data.provider_npi,
    provider_name: data.provider_name,
  };

  // Extract diagnoses if present
  if (Array.isArray(clinical.diagnoses)) {
    summary.diagnoses = (clinical.diagnoses as Array<Record<string, unknown>>).map((d) => ({
      code: String(d.code || ''),
      system: d.system ? String(d.system) : undefined,
      display: String(d.display || ''),
    }));
  }

  // Extract medications if present
  if (Array.isArray(clinical.medications)) {
    summary.medications = (clinical.medications as Array<Record<string, unknown>>).map((m) => ({
      name: String(m.name || ''),
      dosage: m.dosage ? String(m.dosage) : undefined,
      frequency: m.frequency ? String(m.frequency) : undefined,
      status: m.status ? String(m.status) : undefined,
    }));
  }

  // Extract follow-up if present
  if (typeof clinical.follow_up === 'string') {
    summary.follow_up = clinical.follow_up;
  }

  return summary;
}

/**
 * Generate an appointment reminder from InjectaVox data.
 */
function generateAppointmentReminder(data: InjectaVoxData): AppointmentReminder {
  const clinical = data.clinical_data;

  return {
    type: 'appointment_reminder',
    appointment_id: clinical.appointment_id ? String(clinical.appointment_id) : undefined,
    scheduled_at: clinical.scheduled_at ? String(clinical.scheduled_at) : data.timestamp,
    location: clinical.location ? String(clinical.location) : undefined,
    provider_npi: data.provider_npi,
    provider_name: data.provider_name,
    reason: clinical.reason ? String(clinical.reason) : undefined,
    instructions: clinical.instructions ? String(clinical.instructions) : undefined,
  };
}

/**
 * Generate a care plan update from InjectaVox data.
 */
function generateCarePlanUpdate(data: InjectaVoxData): CarePlanUpdate {
  const clinical = data.clinical_data;

  const update: CarePlanUpdate = {
    type: 'care_plan_update',
    care_plan_id: clinical.care_plan_id ? String(clinical.care_plan_id) : undefined,
    summary: data.narrative || String(clinical.summary || 'Care plan updated'),
    provider_npi: data.provider_npi,
    provider_name: data.provider_name,
  };

  if (Array.isArray(clinical.goals)) {
    update.goals = (clinical.goals as Array<Record<string, unknown>>).map((g) => ({
      description: String(g.description || ''),
      status: g.status ? String(g.status) : undefined,
      target_date: g.target_date ? String(g.target_date) : undefined,
    }));
  }

  if (Array.isArray(clinical.interventions)) {
    update.interventions = (clinical.interventions as Array<Record<string, unknown>>).map((i) => ({
      description: String(i.description || ''),
      assigned_to: i.assigned_to ? String(i.assigned_to) : undefined,
      frequency: i.frequency ? String(i.frequency) : undefined,
    }));
  }

  return update;
}

/**
 * Build a narrative summary when none is provided in InjectaVox data.
 */
function buildSummaryNarrative(data: InjectaVoxData): string {
  const typeLabel = data.data_type.replace(/_/g, ' ');
  return `Clinical ${typeLabel} from ${data.provider_name} (NPI: ${data.provider_npi}) on ${data.timestamp}`;
}
