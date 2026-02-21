/**
 * Individual stage handler functions for the CareAgent onboarding interview.
 * Each handler receives an InterviewState, collects user input via InterviewIO,
 * and returns an updated state with the stage advanced to the next step.
 */

import type { InterviewIO } from '../cli/io.js';
import type { CANSDocument } from '../activation/cans-schema.js';
import {
  askText,
  askOptionalText,
  askSelect,
  askConfirm,
  askStringArray,
  askOptionalStringArray,
  askAutonomyTier,
  askVoiceDirective,
} from '../cli/prompts.js';
import type { InterviewState } from './engine.js';
import { InterviewStage } from './engine.js';

// ---------------------------------------------------------------------------
// Welcome Stage
// ---------------------------------------------------------------------------

export async function welcomeStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('================================================================================');
  io.display('  CareAgent Clinical Onboarding');
  io.display('================================================================================');
  io.display('');
  io.display('IMPORTANT: This system is NOT HIPAA compliant. It operates on synthetic data');
  io.display('only. Do not enter real patient information.');
  io.display('');
  io.display(
    'This onboarding will collect your clinical identity, credentials, specialty,\n' +
      'scope of practice, clinical philosophy, documentation voice, and autonomy\n' +
      'preferences to generate your personalized CANS.md profile.',
  );
  io.display('');

  let confirmed = false;
  while (!confirmed) {
    confirmed = await askConfirm(
      io,
      'Do you understand this is NOT HIPAA compliant and uses synthetic data only?',
    );
    if (!confirmed) {
      io.display('Onboarding cannot proceed without acknowledging this warning.');
    }
  }

  return { ...state, stage: InterviewStage.IDENTITY };
}

// ---------------------------------------------------------------------------
// Identity Stage
// ---------------------------------------------------------------------------

export async function identityStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Provider Identity ---');

  const name = await askText(io, 'Your full name (e.g., Dr. Jane Smith): ', {
    required: true,
    minLength: 2,
  });

  let npiValue: string | undefined;
  let npiValid = false;
  while (!npiValid) {
    const npi = await askOptionalText(io, 'National Provider Identifier (NPI, 10 digits):');
    if (npi === undefined) {
      npiValue = undefined;
      npiValid = true;
    } else if (/^\d{10}$/.test(npi)) {
      npiValue = npi;
      npiValid = true;
    } else {
      io.display('NPI must be exactly 10 digits. Please try again or press Enter to skip.');
    }
  }

  const updatedData = {
    ...state.data,
    provider: {
      ...(state.data.provider ?? {}),
      name,
      ...(npiValue !== undefined ? { npi: npiValue } : {}),
    },
  } as Partial<CANSDocument>;

  return { ...state, stage: InterviewStage.CREDENTIALS, data: updatedData };
}

// ---------------------------------------------------------------------------
// Credentials Stage
// ---------------------------------------------------------------------------

export async function credentialsStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Credentials ---');

  const types = await askStringArray(
    io,
    'Provider type(s) (comma-separated, e.g., Physician, Nurse Practitioner): ',
    { required: true },
  );

  const degrees = await askOptionalStringArray(
    io,
    'Degree(s) (comma-separated, e.g., MD, DO, DNP):',
  );

  const licenses = await askOptionalStringArray(
    io,
    'License(s) (comma-separated, e.g., MD-TX-A12345):',
  );

  const certifications = await askOptionalStringArray(
    io,
    'Certification(s) (comma-separated, e.g., ABNS Board Certified):',
  );

  const updatedData = {
    ...state.data,
    provider: {
      ...(state.data.provider ?? {}),
      types,
      degrees,
      licenses,
      certifications,
    },
  } as Partial<CANSDocument>;

  return { ...state, stage: InterviewStage.SPECIALTY, data: updatedData };
}

// ---------------------------------------------------------------------------
// Specialty Stage
// ---------------------------------------------------------------------------

export async function specialtyStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Specialty & Organizations ---');

  const specialtyRaw = await askOptionalText(
    io,
    'Primary specialty (e.g., Neurosurgery, Internal Medicine):',
  );
  const subspecialtyRaw = await askOptionalText(io, 'Subspecialty:');

  // Collect primary organization
  io.display('');
  io.display('--- Primary Organization ---');
  const orgName = await askText(io, 'Organization name (e.g., University Medical Center): ', {
    required: true,
  });
  const departmentRaw = await askOptionalText(io, 'Department:');
  const orgPrivilegesRaw = await askOptionalStringArray(
    io,
    'Privileges at this organization (comma-separated):',
  );

  const primaryOrg = {
    name: orgName,
    ...(departmentRaw !== undefined ? { department: departmentRaw } : {}),
    ...(orgPrivilegesRaw.length > 0 ? { privileges: orgPrivilegesRaw } : {}),
    primary: true,
  };

  const credentialStatusIndex = await askSelect(io, 'Credential status:', [
    'active',
    'pending',
    'expired',
  ]);
  const credentialStatusValues = ['active', 'pending', 'expired'] as const;
  const credentialStatus = credentialStatusValues[credentialStatusIndex];

  const updatedData = {
    ...state.data,
    provider: {
      ...(state.data.provider ?? {}),
      ...(specialtyRaw !== undefined ? { specialty: specialtyRaw } : {}),
      ...(subspecialtyRaw !== undefined ? { subspecialty: subspecialtyRaw } : {}),
      organizations: [primaryOrg],
      credential_status: credentialStatus,
    },
  } as Partial<CANSDocument>;

  return { ...state, stage: InterviewStage.SCOPE, data: updatedData };
}

// ---------------------------------------------------------------------------
// Scope Stage
// ---------------------------------------------------------------------------

export async function scopeStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Scope of Practice ---');
  io.display('Define what CareAgent is permitted to do (whitelist-only model).');

  const permittedActions = await askStringArray(
    io,
    'Permitted actions (comma-separated, e.g., chart_operative_note, chart_progress_note): ',
    { required: true },
  );

  const updatedData = {
    ...state.data,
    scope: {
      permitted_actions: permittedActions,
    },
  };

  return { ...state, stage: InterviewStage.PHILOSOPHY, data: updatedData };
}

// ---------------------------------------------------------------------------
// Philosophy Stage
// ---------------------------------------------------------------------------

export async function philosophyStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Clinical Philosophy ---');
  io.display('Describe your clinical philosophy. This will be included in your CANS.md profile.');

  const philosophy = await askText(
    io,
    'Your clinical philosophy (can be multiple sentences): ',
    { required: true, minLength: 10 },
  );

  return { ...state, stage: InterviewStage.VOICE, philosophy };
}

// ---------------------------------------------------------------------------
// Voice Stage
// ---------------------------------------------------------------------------

export async function voiceStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Clinical Voice ---');
  io.display('Configure voice directives for each atomic action.');
  io.display('These describe how CareAgent should write/communicate for each action type.');
  io.display('Press Enter to skip any action.');

  const chart = await askVoiceDirective(io, 'chart');
  const order = await askVoiceDirective(io, 'order');
  const charge = await askVoiceDirective(io, 'charge');
  const perform = await askVoiceDirective(io, 'perform');
  const interpret = await askVoiceDirective(io, 'interpret');
  const educate = await askVoiceDirective(io, 'educate');
  const coordinate = await askVoiceDirective(io, 'coordinate');

  const updatedData = {
    ...state.data,
    voice: {
      ...(chart !== undefined ? { chart } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(charge !== undefined ? { charge } : {}),
      ...(perform !== undefined ? { perform } : {}),
      ...(interpret !== undefined ? { interpret } : {}),
      ...(educate !== undefined ? { educate } : {}),
      ...(coordinate !== undefined ? { coordinate } : {}),
    },
  };

  return { ...state, stage: InterviewStage.AUTONOMY, data: updatedData };
}

// ---------------------------------------------------------------------------
// Autonomy Stage
// ---------------------------------------------------------------------------

export async function autonomyStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Autonomy Tiers ---');
  io.display("Configure autonomy tiers for CareAgent's seven atomic actions.");
  io.display('');
  io.display('Tiers:');
  io.display('  autonomous  - AI acts independently with post-hoc review');
  io.display('  supervised  - AI drafts, provider approves before execution');
  io.display('  manual      - Provider acts, AI assists on request');

  const chart = await askAutonomyTier(io, 'chart');
  const order = await askAutonomyTier(io, 'order');
  const charge = await askAutonomyTier(io, 'charge');
  const perform = await askAutonomyTier(io, 'perform');
  const interpret = await askAutonomyTier(io, 'interpret');
  const educate = await askAutonomyTier(io, 'educate');
  const coordinate = await askAutonomyTier(io, 'coordinate');

  const updatedData = {
    ...state.data,
    autonomy: { chart, order, charge, perform, interpret, educate, coordinate },
  };

  return { ...state, stage: InterviewStage.CONSENT, data: updatedData };
}

// ---------------------------------------------------------------------------
// Consent Stage
// ---------------------------------------------------------------------------

export async function consentStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Consent ---');
  io.display('Before we generate your CANS.md, please confirm:');

  let hipaa = false;
  while (!hipaa) {
    hipaa = await askConfirm(io, 'I acknowledge this system is NOT HIPAA compliant');
    if (!hipaa) {
      io.display('This acknowledgment is required to proceed.');
    }
  }

  let synthetic = false;
  while (!synthetic) {
    synthetic = await askConfirm(
      io,
      'I will use synthetic data only — no real patient information',
    );
    if (!synthetic) {
      io.display('This acknowledgment is required to proceed.');
    }
  }

  let audit = false;
  while (!audit) {
    audit = await askConfirm(
      io,
      'I consent to all clinical actions being logged to an audit trail',
    );
    if (!audit) {
      io.display('This acknowledgment is required to proceed.');
    }
  }

  const updatedData = {
    ...state.data,
    consent: {
      hipaa_warning_acknowledged: true,
      synthetic_data_only: true,
      audit_consent: true,
      acknowledged_at: new Date().toISOString(),
    },
    skills: state.data.skills ?? { authorized: [] },
  };

  return { ...state, stage: InterviewStage.COMPLETE, data: updatedData };
}
