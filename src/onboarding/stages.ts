/**
 * Individual stage handler functions for the CareAgent onboarding interview.
 * Each handler receives an InterviewState, collects user input via InterviewIO,
 * and returns an updated state with the stage advanced to the next step.
 */

import type { InterviewIO } from '../cli/io.js';
import {
  askText,
  askOptionalText,
  askSelect,
  askConfirm,
  askLicenseType,
  askAutonomyTier,
} from '../cli/prompts.js';
import type { InterviewState } from './engine.js';
import { InterviewStage } from './engine.js';
import { defaultHardening } from './defaults.js';

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
      ...state.data.provider,
      name,
      ...(npiValue !== undefined ? { npi: npiValue } : {}),
    },
  };

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

  const licenseType = await askLicenseType(io);

  const licenseState = (
    await askText(io, 'License state (2-letter abbreviation, e.g., TX): ', {
      required: true,
      minLength: 2,
      maxLength: 2,
    })
  ).toUpperCase();

  const licenseNumber = await askText(io, 'License number: ', { required: true });

  const updatedData = {
    ...state.data,
    provider: {
      ...state.data.provider,
      license: {
        type: licenseType,
        state: licenseState,
        number: licenseNumber,
        verified: false,
      },
    },
  };

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
  io.display('--- Specialty ---');

  const specialty = await askText(
    io,
    'Primary specialty (e.g., Neurosurgery, Internal Medicine): ',
    { required: true },
  );

  const subspecialtyRaw = await askOptionalText(io, 'Subspecialty:');
  const institutionRaw = await askOptionalText(io, 'Institution/Hospital:');

  const privilegesRaw = await askText(
    io,
    'List your clinical privileges (comma-separated, e.g., neurosurgical procedures, spine surgery): ',
    { required: true },
  );
  const privileges = privilegesRaw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

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
      ...state.data.provider,
      specialty,
      ...(subspecialtyRaw !== undefined ? { subspecialty: subspecialtyRaw } : {}),
      ...(institutionRaw !== undefined ? { institution: institutionRaw } : {}),
      privileges,
      credential_status: credentialStatus,
    },
  };

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
  io.display('Define what CareAgent is permitted and prohibited from doing.');

  const permittedRaw = await askText(
    io,
    'Permitted actions (comma-separated, e.g., chart_operative_note, chart_progress_note): ',
    { required: true },
  );
  const permittedActions = permittedRaw
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  const prohibitedRaw = await askOptionalText(io, 'Prohibited actions (comma-separated):');
  const prohibitedActions =
    prohibitedRaw !== undefined
      ? prohibitedRaw
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
      : undefined;

  const limitationsRaw = await askOptionalText(
    io,
    'Institutional limitations (comma-separated):',
  );
  const institutionalLimitations =
    limitationsRaw !== undefined
      ? limitationsRaw
          .split(',')
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
      : undefined;

  const updatedData = {
    ...state.data,
    scope: {
      permitted_actions: permittedActions,
      ...(prohibitedActions !== undefined ? { prohibited_actions: prohibitedActions } : {}),
      ...(institutionalLimitations !== undefined
        ? { institutional_limitations: institutionalLimitations }
        : {}),
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
  io.display('Configure how CareAgent writes clinical documentation in your voice.');

  const toneRaw = await askOptionalText(
    io,
    'Documentation tone (e.g., formal, conversational, concise):',
  );

  const docStyleIndex = await askSelect(io, 'Documentation style:', [
    'Concise bullet-point notes',
    'Narrative paragraphs',
    'Structured templates',
    'Mixed',
  ]);
  const docStyleValues = ['concise', 'narrative', 'structured', 'mixed'] as const;
  const documentationStyle = docStyleValues[docStyleIndex];

  const eponyms = await askConfirm(
    io,
    'Use medical eponyms (e.g., Babinski sign vs. extensor plantar response)?',
  );

  const abbreviationsIndex = await askSelect(io, 'Abbreviation style:', [
    'Standard medical abbreviations',
    'Minimal abbreviations',
    'Spelled out',
  ]);
  const abbreviationsValues = ['standard', 'minimal', 'spelled-out'] as const;
  const abbreviations = abbreviationsValues[abbreviationsIndex];

  const updatedData = {
    ...state.data,
    clinical_voice: {
      ...(toneRaw !== undefined ? { tone: toneRaw } : {}),
      documentation_style: documentationStyle,
      eponyms,
      abbreviations,
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
  io.display('Configure autonomy tiers for CareAgent\'s four atomic actions.');
  io.display('');
  io.display('Tiers:');
  io.display('  autonomous  - AI acts independently with post-hoc review');
  io.display('  supervised  - AI drafts, provider approves before execution');
  io.display('  manual      - Provider acts, AI assists on request');

  const chart = await askAutonomyTier(io, 'chart');
  const order = await askAutonomyTier(io, 'order');
  const charge = await askAutonomyTier(io, 'charge');
  const perform = await askAutonomyTier(io, 'perform');

  const updatedData = {
    ...state.data,
    autonomy: { chart, order, charge, perform },
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
    },
    hardening: defaultHardening,
  };

  return { ...state, stage: InterviewStage.COMPLETE, data: updatedData };
}
