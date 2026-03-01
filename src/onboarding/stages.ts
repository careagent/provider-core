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
      const npi = await askText(io, 'Enter your NPI number (10 digits):', {
        required: true,
        minLength: 10,
      });
      if (/^\d{10}$/.test(npi)) {
        npiValue = npi;
        npiValid = true;
        npiLookup = await tryNpiLookup(npi, io);
      } else {
        io.display('NPI must be exactly 10 digits. Please try again.');
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

  // Step 4: Organization NPI (required for all provider types)
  let organizationName: string | undefined;
  let organizationNpi: string | undefined;

  let orgResolved = false;
  while (!orgResolved) {
    const orgNpiInput = await askText(io, 'Enter your practice or organization NPI (10 digits):', {
      required: true,
      minLength: 10,
    });

    if (!/^\d{10}$/.test(orgNpiInput)) {
      io.display('Organization NPI must be exactly 10 digits. Please try again.');
      continue;
    }

    const orgLookup = await tryNpiLookup(orgNpiInput, io);
    if (orgLookup && orgLookup.enumeration_type === 'NPI-2' && orgLookup.organization_name) {
      io.display('');
      io.display(`Found: ${orgLookup.organization_name}`);
      if (orgLookup.practice_city && orgLookup.practice_state) {
        io.display(`Location: ${orgLookup.practice_city}, ${orgLookup.practice_state}`);
      }
      io.display('');
      const confirmed = await askConfirm(io, 'Is this your practice or organization?');
      if (confirmed) {
        organizationNpi = orgNpiInput;
        organizationName = orgLookup.organization_name;
        orgResolved = true;
      } else {
        io.display('Let\'s try again.');
      }
    } else if (orgLookup && orgLookup.enumeration_type === 'NPI-1') {
      io.display('That NPI belongs to an individual provider, not an organization. Please enter the organization NPI.');
    } else {
      // Lookup failed or returned no org name — ask for name manually
      io.display('Could not find that organization in the NPI registry.');
      organizationNpi = orgNpiInput;
      organizationName = await askText(io, 'Enter your organization name:', {
        required: true,
        minLength: 2,
      });
      orgResolved = true;
    }
  }

  const updatedData = {
    ...state.data,
    provider: {
      ...(state.data.provider ?? {}),
      name,
      ...(npiValue !== undefined ? { npi: npiValue } : {}),
      ...(specialty !== undefined ? { specialty } : {}),
      organizations: [{
        name: organizationName!,
        ...(organizationNpi ? { npi: organizationNpi } : {}),
        primary: true,
      }],
    },
    // Carry forward NPI lookup data for later stages to use
    _npiLookup: npiLookup ?? undefined,
    _selectedTypeId: selectedTypeId,
    _selectedTypeLabel: selectedTypeLabel,
    _credential: credential,
    _licenseState: licenseState,
    _licenseNumber: licenseNumber,
    _organizationName: organizationName,
    _organizationNpi: organizationNpi,
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

  let types: string[];
  if (selectedTypeLabel && selectedTypeLabel !== 'Other') {
    // Clean up display label (e.g., "Advanced Practice Provider (NP, PA, CRNA, CNM)" → "Advanced Practice Provider")
    const cleanType = selectedTypeLabel.replace(/\s*\(.*\)$/, '');
    io.display(`Provider type: ${cleanType} (from previous step)`);
    const addMore = await askConfirm(io, 'Do you practice in any other roles?');
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

  // Degrees, licenses, certifications are now handled by the Axon questionnaire
  // in the scope stage. Only ask here if no questionnaire will run (no AXON_URL).
  let degrees: string[] = [];
  let licenses: string[] = [];
  let certifications: string[] = [];

  if (!process.env.AXON_URL) {
    degrees = await askOptionalStringArray(
      io,
      'Degree(s) (comma-separated, e.g., MD, DO, DNP):',
    );
    licenses = await askOptionalStringArray(
      io,
      'License(s) (comma-separated, e.g., MD-TX-A12345):',
    );
    certifications = await askOptionalStringArray(
      io,
      'Certification(s) (comma-separated, e.g., ABNS Board Certified):',
    );
  } else {
    io.display('Credentials will be collected via the clinical questionnaire.');
  }

  const updatedData = {
    ...state.data,
    provider: {
      ...(state.data.provider ?? {}),
      types,
      ...(degrees.length > 0 ? { degrees } : {}),
      ...(licenses.length > 0 ? { licenses } : {}),
      ...(certifications.length > 0 ? { certifications } : {}),
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
  io.display('--- Specialty ---');

  // When AXON_URL is set, the questionnaire handles specialties/subspecialties.
  // Only ask for credential status here.
  if (process.env.AXON_URL) {
    io.display('Specialties will be collected via the clinical questionnaire.');
  }

  // Check if specialty was pre-filled from NPI lookup (stored as singular during identity stage)
  const existingSpecialty = state.data.provider?.specialty;
  let specialties: string[] | undefined;
  let subspecialties: string[] | undefined;

  if (!process.env.AXON_URL) {
    if (existingSpecialty) {
      io.display(`Specialty from NPI registry: ${existingSpecialty}`);
      const changeSpecialty = await askConfirm(io, 'Would you like to change this?');
      if (changeSpecialty) {
        const raw = await askOptionalText(
          io,
          'Specialty or specialties (comma-separated, e.g., Neurosurgery, Internal Medicine):',
        );
        specialties = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      } else {
        specialties = [existingSpecialty];
      }
    } else {
      const raw = await askOptionalText(
        io,
        'Specialty or specialties (comma-separated, e.g., Neurosurgery, Internal Medicine):',
      );
      specialties = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    }

    const subspecialtyRaw = await askOptionalText(io, 'Subspecialty or subspecialties (comma-separated):');
    subspecialties = subspecialtyRaw ? subspecialtyRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  }

  // credential_status is NOT asked during onboarding — it's set to 'pending'
  // here and updated to 'active' by background license verification.
  // See: src/credentials/license-verification.ts (stub)

  const updatedData = {
    ...state.data,
    provider: {
      ...(state.data.provider ?? {}),
      ...(specialties !== undefined ? { specialties, specialty: specialties[0] } : {}),
      ...(subspecialties !== undefined ? { subspecialties, subspecialty: subspecialties[0] } : {}),
      credential_status: 'pending' as const,
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
  subspecialtyValues: string[];
  organizationName?: string;
  organizationNpi?: string;
  degrees: string[];
  licenses: string[];
  certifications: string[];
  specialties: string[];
  subspecialties: string[];
  deaNumber?: string;
}

/**
 * Resolve NPI pre-fill value for a question.
 * Maps `npi_prefill` keys to NPI lookup fields.
 */
function getNpiPrefill(
  key: string | undefined,
  npiLookup: AxonNpiLookupResult | null | undefined,
): string | undefined {
  if (!key || !npiLookup) return undefined;
  if (key === 'credential') return npiLookup.credential;
  if (key === 'specialty') return npiLookup.specialty;
  // License pre-fill: handled by special license flow in questionnaire runner.
  // This fallback is for backward compat when licenses array is not available.
  if (key === 'license') {
    if (npiLookup.licenses && npiLookup.licenses.length > 0) {
      // Multi-license — handled by special flow, return undefined to skip generic pre-fill
      return undefined;
    }
    if (npiLookup.license_state && npiLookup.license_number) {
      return `${npiLookup.license_state}-${npiLookup.license_number}`;
    }
  }
  return undefined;
}

/**
 * Run the Axon physician questionnaire over InterviewIO.
 * Returns the collected permitted_actions and any CANS field values.
 *
 * @param npiLookup — NPI-1 lookup from the identity stage, used for pre-fill
 */
async function runAxonQuestionnaire(
  questionnaire: AxonQuestionnaire,
  io: InterviewIO,
  npiLookup?: AxonNpiLookupResult | null,
): Promise<QuestionnaireResult> {
  const permittedActions: string[] = [];
  const answers = new Map<string, string>();
  let practiceSettingValue: string | undefined;
  const subspecialtyValues: string[] = [];
  let organizationName: string | undefined;
  let organizationNpi: string | undefined;
  const degrees: string[] = [];
  const licenses: string[] = [];
  const certifications: string[] = [];
  const specialties: string[] = [];
  const subspecialties: string[] = [];
  let deaNumber: string | undefined;

  for (const question of questionnaire.questions) {
    // Check show_when condition
    if (!shouldShowQuestion(question, answers)) {
      continue;
    }

    // Skip organization questions — already collected in identity stage
    if (question.id === 'practice_npi' || question.id === 'practice_name') {
      // Organization was collected in identity stage; carry forward
      if (question.id === 'practice_name' && organizationName) {
        answers.set(question.id, organizationName);
      }
      continue;
    }

    // Special handling: license questions with multi-state NPI data
    if (question.id === 'has_licenses' && npiLookup?.licenses && npiLookup.licenses.length > 0) {
      const npiLicenses = npiLookup.licenses;
      const stateList = npiLicenses.map(l => l.state);
      const uniqueStates = [...new Set(stateList)];

      // "I see you have licenses to practice in the following states: SC, NC. Is that correct?"
      io.display(`I see that you have licenses to practice in the following state${uniqueStates.length > 1 ? 's' : ''}: ${uniqueStates.join(', ')}.`);
      const statesCorrect = await askConfirm(io, 'Is that correct?');

      if (statesCorrect) {
        answers.set('has_licenses', 'true');

        // Ask about primary practice state if we can infer it from practice address
        const practiceState = npiLookup.practice_state;
        if (practiceState && uniqueStates.includes(practiceState)) {
          await askConfirm(io, `Is ${practiceState} your primary practice state?`);
          // (informational — we already have it from practice address)
        } else if (uniqueStates.length > 1) {
          const primaryIdx = await askSelect(io, 'Which is your primary practice state?', uniqueStates);
          // Store for reference — practice_state from address may differ
          answers.set('__primary_practice_state', uniqueStates[primaryIdx]!);
        }

        // Lock in all license strings
        const licenseStrings = npiLicenses.map(l => `${l.state}-${l.number}`);
        licenses.push(...licenseStrings);
        answers.set('licenses_list', licenseStrings.join(', '));
        answers.set(`__prefill_confirmed_has_licenses`, licenseStrings.join(', '));

        // Ask for additional licenses not in NPI
        const hasMore = await askConfirm(io, 'Do you hold any additional state licenses not listed here?');
        if (hasMore) {
          const additional = await askOptionalText(io, 'Additional license(s) (comma-separated, e.g., NC-MD-54321):');
          if (additional) {
            const extras = additional.split(',').map(s => s.trim()).filter(Boolean);
            licenses.push(...extras);
            answers.set('licenses_list', [...licenseStrings, ...extras].join(', '));
          }
        }
      } else {
        // Provider says NPI license data is wrong — ask manually
        answers.set('has_licenses', 'true');
        const manualLicenses = await askText(io, 'List your license(s) (comma-separated, e.g., SC-25231, NC-MD-54321):', { required: true, minLength: 1 });
        const items = manualLicenses.split(',').map(s => s.trim()).filter(Boolean);
        licenses.push(...items);
        answers.set('licenses_list', items.join(', '));
      }
      continue;
    }

    // Skip licenses_list if already handled by the special license flow above
    if (question.id === 'licenses_list' && answers.has('licenses_list')) {
      continue;
    }

    // Resolve NPI pre-fill value
    const prefillValue = getNpiPrefill(question.npi_prefill, npiLookup);

    if (question.answer_type === 'boolean') {
      let answer: boolean;

      if (prefillValue) {
        // NPI pre-fill: confirm what we already know
        const confirmed = await askConfirm(io, `You are listed as ${prefillValue}; is that correct?`);
        if (confirmed) {
          // Lock in the pre-fill value — the follow-up text question will ask
          // "do you have any additional X?" instead of the full list
          answers.set(question.id, 'true');
          answers.set(`__prefill_confirmed_${question.id}`, prefillValue);
          answer = true;
        } else {
          // Provider rejected pre-fill — treat as if no pre-fill existed
          // The follow-up text question will ask for the full list
          answers.set(question.id, 'true');
          answer = true;
        }
      } else {
        answer = await askConfirm(io, question.text);
        answers.set(question.id, String(answer));
      }

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
      } else if (question.cans_field === 'provider.subspecialties') {
        subspecialtyValues.push(selectedOption.label);
        subspecialties.push(selectedOption.label);
      }
    } else if (question.answer_type === 'text') {
      // Text input — with optional validation, NPI lookup, and pre-fill
      let textValue: string | undefined;
      const isRequired = question.required;
      const pattern = question.validation?.pattern ? new RegExp(question.validation.pattern) : undefined;
      const minLen = question.validation?.min_length ?? 0;

      // Check if the parent boolean had a confirmed pre-fill
      const parentId = question.show_when?.question_id;
      const confirmedPrefill = parentId ? answers.get(`__prefill_confirmed_${parentId}`) : undefined;

      if (confirmedPrefill) {
        // Pre-fill was confirmed — lock it in and ask for additions only
        textValue = confirmedPrefill;
        const hasMore = await askConfirm(io, `Do you have any additional ${question.cans_field?.split('.').pop() ?? 'entries'}?`);
        if (hasMore) {
          const additional = await askOptionalText(io, `Additional (comma-separated):`);
          if (additional) {
            textValue = `${confirmedPrefill}, ${additional}`;
          }
        }
      } else if (prefillValue) {
        // Text-level pre-fill (no parent boolean) — confirm or replace
        const keepPrefill = await askConfirm(io, `You are listed as ${prefillValue}; is that correct?`);
        if (keepPrefill) {
          textValue = prefillValue;
          const hasMore = await askConfirm(io, `Do you have any additional ${question.cans_field?.split('.').pop() ?? 'entries'}?`);
          if (hasMore) {
            const additional = await askOptionalText(io, `Additional (comma-separated):`);
            if (additional) {
              textValue = `${prefillValue}, ${additional}`;
            }
          }
        } else {
          // Rejected — ask for the full list manually
          let valid = false;
          while (!valid) {
            const raw = isRequired
              ? await askText(io, question.text, { required: true, minLength: minLen })
              : (await askOptionalText(io, question.text));
            if (raw === undefined) { textValue = undefined; valid = true; }
            else if (pattern && !pattern.test(raw)) { io.display(`Invalid format. Expected: ${question.validation?.pattern}`); }
            else { textValue = raw; valid = true; }
          }
        }
      } else {
        // No pre-fill — ask normally
        let valid = false;
        while (!valid) {
          const raw = isRequired
            ? await askText(io, question.text, { required: true, minLength: minLen })
            : (await askOptionalText(io, question.text));
          if (raw === undefined) { textValue = undefined; valid = true; }
          else if (pattern && !pattern.test(raw)) { io.display(`Invalid format. Expected: ${question.validation?.pattern}`); }
          else { textValue = raw; valid = true; }
        }
      }

      answers.set(question.id, textValue ?? '');

      // Collect credential/specialty lists from text answers
      if (textValue) {
        if (question.cans_field === 'provider.dea_number') {
          deaNumber = textValue;
        } else {
          const items = textValue.split(',').map((s) => s.trim()).filter(Boolean);
          if (question.cans_field === 'provider.degrees') degrees.push(...items);
          else if (question.cans_field === 'provider.licenses') licenses.push(...items);
          else if (question.cans_field === 'provider.certifications') certifications.push(...items);
          else if (question.cans_field === 'provider.specialties') specialties.push(...items);
          else if (question.cans_field === 'provider.subspecialties') subspecialties.push(...items);
        }
      }

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
              answers.set('practice_name', organizationName);
            }
          } else if (lookup.enumeration_type === 'NPI-1') {
            io.display('That NPI belongs to an individual provider, not an organization.');
            io.display("You'll be asked for your organization name next.");
          }
        }
      } else if (question.cans_field === 'provider.organizations' && question.id === 'practice_name') {
        if (textValue && !organizationName) {
          organizationName = textValue;
        }
      }
    }
  }

  return {
    permittedActions,
    practiceSettingValue,
    subspecialtyValues,
    organizationName,
    organizationNpi,
    degrees,
    licenses,
    certifications,
    specialties,
    subspecialties,
    deaNumber,
  };
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
  let organizationName: string | undefined;
  let organizationNpi: string | undefined;
  let questionnaireDegrees: string[] = [];
  let questionnaireLicenses: string[] = [];
  let questionnaireCertifications: string[] = [];
  let questionnaireSpecialties: string[] = [];
  let questionnaireSubspecialties: string[] = [];
  let questionnaireDeaNumber: string | undefined;

  // Extract NPI lookup from identity stage (carried on state.data)
  const extra = state.data as Record<string, unknown>;
  const npiLookup = extra._npiLookup as AxonNpiLookupResult | null | undefined;

  if (axonUrl) {
    try {
      io.display('');
      io.display('Fetching clinical questionnaire from Axon registry...');
      const axonClient = createAxonClient({ baseUrl: axonUrl, timeoutMs: 10_000 });
      const questionnaire = await axonClient.getQuestionnaire('physician');
      io.display(`Loaded: ${questionnaire.display_name} (${questionnaire.questions.length} questions)`);
      io.display('');

      const result = await runAxonQuestionnaire(questionnaire, io, npiLookup);
      permittedActions = result.permittedActions;
      practiceSettingValue = result.practiceSettingValue;
      organizationName = result.organizationName;
      organizationNpi = result.organizationNpi;
      questionnaireDegrees = result.degrees;
      questionnaireLicenses = result.licenses;
      questionnaireCertifications = result.certifications;
      questionnaireSpecialties = result.specialties;
      questionnaireSubspecialties = [...result.subspecialties, ...result.subspecialtyValues];
      questionnaireDeaNumber = result.deaNumber;

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

  // Organization is collected in identity stage — use it from state.data
  // Only ask manually if somehow missing (shouldn't happen with required org NPI)
  let organizations: Array<{ name: string; npi?: string; primary: boolean }> | undefined;

  if (state.data.provider?.organizations?.length) {
    // Already set in identity stage — keep it
    organizations = undefined; // don't overwrite
  } else if (organizationName) {
    // From questionnaire fallback (shouldn't happen with new flow)
    organizations = [{
      name: organizationName,
      ...(organizationNpi !== undefined ? { npi: organizationNpi } : {}),
      primary: true,
    }];
  } else {
    // Last resort fallback
    io.display('');
    const orgName = await askText(io, 'Organization/practice name (e.g., University Medical Center): ', {
      required: true,
    });
    organizations = [{ name: orgName, primary: true }];
  }

  // Merge questionnaire-collected credentials with any existing data from credentials stage
  const existingDegrees = state.data.provider?.degrees ?? [];
  const existingLicenses = state.data.provider?.licenses ?? [];
  const existingCerts = state.data.provider?.certifications ?? [];
  const existingSpecialties = state.data.provider?.specialties ?? [];
  const existingSubspecialties = state.data.provider?.subspecialties ?? [];

  const mergedDegrees = [...new Set([...existingDegrees, ...questionnaireDegrees])];
  const mergedLicenses = [...new Set([...existingLicenses, ...questionnaireLicenses])];
  const mergedCerts = [...new Set([...existingCerts, ...questionnaireCertifications])];
  const mergedSpecialties = [...new Set([...existingSpecialties, ...questionnaireSpecialties])];
  const mergedSubspecialties = [...new Set([...existingSubspecialties, ...questionnaireSubspecialties])];

  // chart.operative_note is a documentation privilege granted when the provider
  // has a surgical specialty and documents clinical encounters.
  const isSurgical = [...mergedSpecialties, ...mergedSubspecialties].some(
    (s) => /surg/i.test(s),
  );
  const chartsEncounters = permittedActions.some((a) => a.startsWith('chart.'));
  if (isSurgical && chartsEncounters && !permittedActions.includes('chart.operative_note')) {
    permittedActions.push('chart.operative_note');
  }

  const updatedData = {
    ...state.data,
    scope: {
      permitted_actions: permittedActions,
      ...(practiceSettingValue !== undefined ? { practice_setting: practiceSettingValue } : {}),
    },
    provider: {
      ...(state.data.provider ?? {}),
      ...(mergedDegrees.length > 0 ? { degrees: mergedDegrees } : {}),
      ...(mergedLicenses.length > 0 ? { licenses: mergedLicenses } : {}),
      ...(mergedCerts.length > 0 ? { certifications: mergedCerts } : {}),
      ...(mergedSpecialties.length > 0 ? { specialties: mergedSpecialties, specialty: mergedSpecialties[0] } : {}),
      ...(mergedSubspecialties.length > 0 ? { subspecialties: mergedSubspecialties, subspecialty: mergedSubspecialties[0] } : {}),
      ...(questionnaireDeaNumber !== undefined ? { dea_number: questionnaireDeaNumber } : {}),
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
  io.display('Configure your preferred writing style for CareAgent documentation.');
  io.display('Press Enter to skip any category.');

  const chart = await askVoiceDirective(io, 'chart');
  const educate = await askVoiceDirective(io, 'educate');
  const interpret = await askVoiceDirective(io, 'interpret', 'Documenting results (labs, imaging, EKG, etc.)');

  const updatedData = {
    ...state.data,
    voice: {
      ...(chart !== undefined ? { chart } : {}),
      ...(educate !== undefined ? { educate } : {}),
      ...(interpret !== undefined ? { interpret } : {}),
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
  io.display('Before we generate your CANS.md, you must acknowledge each of the following.');
  io.display('If you do not agree to any of these, onboarding cannot be completed and your CANS.md will not be written.');
  io.display('');

  const hipaa = await askConfirm(io, 'I acknowledge this system is NOT HIPAA compliant.');
  if (!hipaa) {
    io.display('');
    io.display('You must acknowledge that this system is not HIPAA compliant to proceed.');
    io.display('Onboarding cannot be completed. No CANS.md has been written.');
    return { ...state, stage: InterviewStage.CONSENT };
  }

  const synthetic = await askConfirm(
    io,
    'I will use synthetic data only — no real patient information will be entered.',
  );
  if (!synthetic) {
    io.display('');
    io.display('You must agree to use synthetic data only to proceed.');
    io.display('Onboarding cannot be completed. No CANS.md has been written.');
    return { ...state, stage: InterviewStage.CONSENT };
  }

  const audit = await askConfirm(
    io,
    'I consent to all clinical actions being logged to an audit trail.',
  );
  if (!audit) {
    io.display('');
    io.display('You must consent to audit logging to proceed.');
    io.display('Onboarding cannot be completed. No CANS.md has been written.');
    return { ...state, stage: InterviewStage.CONSENT };
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
