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
import { createAxonClient } from '../axon/client.js';
import type { AxonQuestionnaire, AxonQuestion, AxonNpiLookupResult } from '../axon/types.js';

// ---------------------------------------------------------------------------
// NPI-eligible provider types — types that typically have individual NPIs.
// Used to determine whether to ask for NPI during identity stage.
// ---------------------------------------------------------------------------

const NPI_ELIGIBLE_TYPES = new Set([
  'physician',
  'advanced_practice_provider',
  'nursing',
  'pharmacy',
  'dental',
  'behavioral_mental_health',
  'physical_rehabilitation',
  'occupational_therapy',
  'speech_language',
  'respiratory',
  'audiology',
  'vision_optometry',
  'podiatry',
  'chiropractic',
  'midwifery',
  'nutrition_dietetics',
]);

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

/**
 * Attempt NPI lookup via Axon (which proxies to NPPES).
 * Returns the lookup result or null on any failure.
 */
async function tryNpiLookup(npi: string, io: InterviewIO): Promise<AxonNpiLookupResult | null> {
  const axonUrl = process.env.AXON_URL;
  if (!axonUrl) return null;

  try {
    io.display('Looking up NPI in the national registry...');
    const axonClient = createAxonClient({ baseUrl: axonUrl, timeoutMs: 15_000 });
    return await axonClient.lookupNpi(npi);
  } catch {
    io.display('Could not reach the NPI registry — you can enter your details manually.');
    return null;
  }
}

export async function identityStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Provider Identity ---');

  // Step 1: Ask for provider type
  const providerTypeOptions = [
    'Physician',
    'Advanced Practice Provider (NP, PA, CRNA, CNM)',
    'Nursing',
    'Pharmacy',
    'Dental',
    'Behavioral/Mental Health',
    'Physical Rehabilitation',
    'Other',
  ];
  const typeIndex = await askSelect(io, 'What type of provider are you?', providerTypeOptions);
  const typeIds = [
    'physician', 'advanced_practice_provider', 'nursing', 'pharmacy',
    'dental', 'behavioral_mental_health', 'physical_rehabilitation', 'other',
  ];
  const selectedTypeId = typeIds[typeIndex] ?? 'other';
  const selectedTypeLabel = providerTypeOptions[typeIndex] ?? 'Other';

  // Step 2: If NPI-eligible, ask for NPI and attempt lookup
  let npiValue: string | undefined;
  let npiLookup: AxonNpiLookupResult | null = null;

  if (NPI_ELIGIBLE_TYPES.has(selectedTypeId)) {
    let npiValid = false;
    while (!npiValid) {
      const npi = await askOptionalText(io, 'Enter your NPI number (10 digits):');
      if (npi === undefined) {
        npiValue = undefined;
        npiValid = true;
      } else if (/^\d{10}$/.test(npi)) {
        npiValue = npi;
        npiValid = true;
        npiLookup = await tryNpiLookup(npi, io);
      } else {
        io.display('NPI must be exactly 10 digits. Please try again or press Enter to skip.');
      }
    }
  }

  // Step 3: If lookup succeeded, show what we found and confirm
  let name: string;
  let specialty: string | undefined;
  let credential: string | undefined;
  let licenseState: string | undefined;
  let licenseNumber: string | undefined;

  if (npiLookup && npiLookup.enumeration_type === 'NPI-1') {
    io.display('');
    io.display(`Found: ${npiLookup.name}`);
    if (npiLookup.specialty) io.display(`Specialty: ${npiLookup.specialty}`);
    if (npiLookup.practice_state) io.display(`State: ${npiLookup.practice_state}`);
    io.display('');

    const confirmed = await askConfirm(io, 'Is this you?');
    if (confirmed) {
      name = npiLookup.name;
      specialty = npiLookup.specialty;
      credential = npiLookup.credential;
      licenseState = npiLookup.license_state;
      licenseNumber = npiLookup.license_number;
    } else {
      name = await askText(io, 'Your full name (e.g., Dr. Jane Smith): ', {
        required: true,
        minLength: 2,
      });
    }
  } else {
    // No lookup or NPI-2 (org) — ask manually
    name = await askText(io, 'Your full name (e.g., Dr. Jane Smith): ', {
      required: true,
      minLength: 2,
    });
  }

  const updatedData = {
    ...state.data,
    provider: {
      ...(state.data.provider ?? {}),
      name,
      ...(npiValue !== undefined ? { npi: npiValue } : {}),
      ...(specialty !== undefined ? { specialty } : {}),
    },
    // Carry forward NPI lookup data for later stages to use
    _npiLookup: npiLookup ?? undefined,
    _selectedTypeId: selectedTypeId,
    _selectedTypeLabel: selectedTypeLabel,
    _credential: credential,
    _licenseState: licenseState,
    _licenseNumber: licenseNumber,
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

  // Pre-fill provider type from identity stage selection
  const extra = state.data as Record<string, unknown>;
  const selectedTypeLabel = extra._selectedTypeLabel as string | undefined;
  const credential = extra._credential as string | undefined;
  const licenseState = extra._licenseState as string | undefined;
  const licenseNumber = extra._licenseNumber as string | undefined;

  let types: string[];
  if (selectedTypeLabel && selectedTypeLabel !== 'Other') {
    // Clean up display label (e.g., "Advanced Practice Provider (NP, PA, CRNA, CNM)" → "Advanced Practice Provider")
    const cleanType = selectedTypeLabel.replace(/\s*\(.*\)$/, '');
    io.display(`Provider type: ${cleanType} (from previous step)`);
    const addMore = await askConfirm(io, 'Add additional provider types?');
    if (addMore) {
      const additional = await askStringArray(
        io,
        'Additional provider type(s) (comma-separated): ',
        { required: true },
      );
      types = [cleanType, ...additional];
    } else {
      types = [cleanType];
    }
  } else {
    types = await askStringArray(
      io,
      'Provider type(s) (comma-separated, e.g., Physician, Nurse Practitioner): ',
      { required: true },
    );
  }

  // Pre-fill credential as degree if available from NPI lookup
  let degrees: string[];
  if (credential) {
    io.display(`Credential from NPI registry: ${credential}`);
    const moreDegrees = await askOptionalStringArray(
      io,
      'Additional degree(s) (comma-separated, or Enter to keep just the above):',
    );
    degrees = moreDegrees.length > 0 ? [credential, ...moreDegrees] : [credential];
  } else {
    degrees = await askOptionalStringArray(
      io,
      'Degree(s) (comma-separated, e.g., MD, DO, DNP):',
    );
  }

  // Pre-fill license from NPI lookup if available
  let licenses: string[];
  if (licenseState && licenseNumber) {
    const prefilled = `${licenseState}-${licenseNumber}`;
    io.display(`License from NPI registry: ${prefilled}`);
    const moreLicenses = await askOptionalStringArray(
      io,
      'Additional license(s) (comma-separated, or Enter to keep just the above):',
    );
    licenses = moreLicenses.length > 0 ? [prefilled, ...moreLicenses] : [prefilled];
  } else {
    licenses = await askOptionalStringArray(
      io,
      'License(s) (comma-separated, e.g., MD-TX-A12345):',
    );
  }

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
  io.display('--- Specialty & Credentials ---');

  // Check if specialty was pre-filled from NPI lookup
  const existingSpecialty = state.data.provider?.specialty;
  let specialtyRaw: string | undefined;

  if (existingSpecialty) {
    io.display(`Specialty from NPI registry: ${existingSpecialty}`);
    const changeSpecialty = await askConfirm(io, 'Would you like to change this?');
    if (changeSpecialty) {
      specialtyRaw = await askOptionalText(
        io,
        'Primary specialty (e.g., Neurosurgery, Internal Medicine):',
      );
    } else {
      specialtyRaw = existingSpecialty;
    }
  } else {
    specialtyRaw = await askOptionalText(
      io,
      'Primary specialty (e.g., Neurosurgery, Internal Medicine):',
    );
  }

  const subspecialtyRaw = await askOptionalText(io, 'Subspecialty:');

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
      credential_status: credentialStatus,
    },
  } as Partial<CANSDocument>;

  return { ...state, stage: InterviewStage.SCOPE, data: updatedData };
}

// ---------------------------------------------------------------------------
// Scope Stage
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a question should be shown based on its show_when condition.
 * Checks previous answers to determine visibility.
 */
function shouldShowQuestion(
  question: AxonQuestion,
  answers: Map<string, string>,
): boolean {
  if (!question.show_when) return true;
  const { question_id, equals } = question.show_when;
  return answers.get(question_id) === equals;
}

/** Result of running the Axon questionnaire. */
interface QuestionnaireResult {
  permittedActions: string[];
  practiceSettingValue?: string;
  subspecialtyValue?: string;
  organizationName?: string;
  organizationNpi?: string;
}

/**
 * Run the Axon physician questionnaire over InterviewIO.
 * Returns the collected permitted_actions and any CANS field values.
 */
async function runAxonQuestionnaire(
  questionnaire: AxonQuestionnaire,
  io: InterviewIO,
): Promise<QuestionnaireResult> {
  const permittedActions: string[] = [];
  const answers = new Map<string, string>();
  let practiceSettingValue: string | undefined;
  let subspecialtyValue: string | undefined;
  let organizationName: string | undefined;
  let organizationNpi: string | undefined;

  for (const question of questionnaire.questions) {
    // Check show_when condition
    if (!shouldShowQuestion(question, answers)) {
      continue;
    }

    if (question.answer_type === 'boolean') {
      const answer = await askConfirm(io, question.text);
      const answerStr = String(answer);
      answers.set(question.id, answerStr);

      // Process action_assignments
      if (answer && question.action_assignments) {
        for (const assignment of question.action_assignments) {
          if (assignment.answer_value === 'true') {
            permittedActions.push(...assignment.grants);
          }
        }
      }
    } else if (question.answer_type === 'single_select' && question.options) {
      const optionLabels = question.options.map((o) => o.label);
      const selectedIndex = await askSelect(io, question.text, optionLabels);
      const selectedOption = question.options[selectedIndex];
      answers.set(question.id, selectedOption.value);

      // Map to CANS fields
      if (question.cans_field === 'scope.practice_setting') {
        practiceSettingValue = selectedOption.value;
      } else if (question.cans_field === 'provider.subspecialty') {
        subspecialtyValue = selectedOption.value;
      }
    } else if (question.answer_type === 'text') {
      // Text input — with optional validation and NPI lookup
      let textValue: string | undefined;
      const isRequired = question.required;
      const pattern = question.validation?.pattern ? new RegExp(question.validation.pattern) : undefined;
      const minLen = question.validation?.min_length ?? 0;

      let valid = false;
      while (!valid) {
        const raw = isRequired
          ? await askText(io, question.text, { required: true, minLength: minLen })
          : (await askOptionalText(io, question.text));

        if (raw === undefined) {
          // Skipped optional question
          textValue = undefined;
          valid = true;
        } else if (pattern && !pattern.test(raw)) {
          io.display(`Invalid format. Expected: ${question.validation?.pattern}`);
        } else {
          textValue = raw;
          valid = true;
        }
      }

      answers.set(question.id, textValue ?? '');

      // NPI organization lookup
      if (question.npi_lookup && textValue && /^\d{10}$/.test(textValue)) {
        const lookup = await tryNpiLookup(textValue, io);
        if (lookup) {
          organizationNpi = textValue;
          if (lookup.enumeration_type === 'NPI-2' && lookup.organization_name) {
            io.display(`Found organization: ${lookup.organization_name}`);
            if (lookup.practice_city && lookup.practice_state) {
              io.display(`Location: ${lookup.practice_city}, ${lookup.practice_state}`);
            }
            const confirmed = await askConfirm(io, 'Is this your practice/organization?');
            if (confirmed) {
              organizationName = lookup.organization_name;
              // Skip the next practice_name question since we have it from NPI
              answers.set('practice_name', organizationName);
            }
          } else if (lookup.enumeration_type === 'NPI-1') {
            io.display('That NPI belongs to an individual provider, not an organization.');
            io.display("You'll be asked for your organization name next.");
          }
        }
      } else if (question.cans_field === 'provider.organizations' && question.id === 'practice_name') {
        // Manual practice name entry (when NPI wasn't provided or lookup failed)
        if (textValue && !organizationName) {
          organizationName = textValue;
        }
      }
    }
  }

  return { permittedActions, practiceSettingValue, subspecialtyValue, organizationName, organizationNpi };
}

export async function scopeStage(
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  io.display('');
  io.display('--- Scope of Practice ---');
  io.display('Define what CareAgent is permitted to do (whitelist-only model).');

  // Try to fetch the Axon physician questionnaire
  const axonUrl = process.env.AXON_URL;
  let permittedActions: string[] = [];
  let practiceSettingValue: string | undefined;
  let subspecialtyValue: string | undefined;
  let organizationName: string | undefined;
  let organizationNpi: string | undefined;

  if (axonUrl) {
    try {
      io.display('');
      io.display('Fetching scope questionnaire from Axon registry...');
      const axonClient = createAxonClient({ baseUrl: axonUrl, timeoutMs: 10_000 });
      const questionnaire = await axonClient.getQuestionnaire('physician');
      io.display(`Loaded: ${questionnaire.display_name} (${questionnaire.questions.length} questions)`);
      io.display('');

      const result = await runAxonQuestionnaire(questionnaire, io);
      permittedActions = result.permittedActions;
      practiceSettingValue = result.practiceSettingValue;
      subspecialtyValue = result.subspecialtyValue;
      organizationName = result.organizationName;
      organizationNpi = result.organizationNpi;

      if (permittedActions.length > 0) {
        io.display('');
        io.display(`Granted ${permittedActions.length} action(s) based on your answers.`);
      }
    } catch {
      io.display('');
      io.display('Could not reach Axon registry — falling back to manual scope entry.');
      permittedActions = [];
    }
  }

  // Fallback: manual scope entry if Axon questionnaire didn't produce results
  if (permittedActions.length === 0) {
    permittedActions = await askStringArray(
      io,
      'Permitted actions (comma-separated, e.g., chart_operative_note, chart_progress_note): ',
      { required: true },
    );
  }

  // Build organization from questionnaire or ask manually
  let organizations: Array<{ name: string; npi?: string; primary: boolean }> | undefined;

  if (organizationName) {
    organizations = [{
      name: organizationName,
      ...(organizationNpi !== undefined ? { npi: organizationNpi } : {}),
      primary: true,
    }];
  } else if (!state.data.provider?.organizations?.length) {
    // No organization from questionnaire and none from prior stages — ask manually
    io.display('');
    const orgName = await askText(io, 'Organization/practice name (e.g., University Medical Center): ', {
      required: true,
    });
    organizations = [{ name: orgName, primary: true }];
  }

  const updatedData = {
    ...state.data,
    scope: {
      permitted_actions: permittedActions,
      ...(practiceSettingValue !== undefined ? { practice_setting: practiceSettingValue } : {}),
    },
    provider: {
      ...(state.data.provider ?? {}),
      ...(subspecialtyValue !== undefined ? { subspecialty: subspecialtyValue } : {}),
      ...(organizations !== undefined ? { organizations } : {}),
    },
  } as Partial<CANSDocument>;

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
