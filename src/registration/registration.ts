/**
 * Provider registration orchestrator — coordinates NPI validation,
 * key pair generation, neuron registration, CANS.md activation gate,
 * skill loading, and provider profile persistence.
 *
 * This is the Session 07a entry point that ties together:
 *
 * 1. NPI validation (format + Luhn check)
 * 2. Ed25519 key pair generation
 * 3. Neuron → Axon registration (NPI + credentials → DID)
 * 4. CANS.md 4-step activation gate
 * 5. 6-step clinical skill loading pipeline
 * 6. Provider profile persistence
 *
 * All steps are audit-logged. Error handling covers Axon unreachable,
 * NPI already registered, activation failure, and invalid credentials.
 */

import type { AuditPipeline } from '../audit/pipeline.js';
import type { NeuronClient, NeuronCredential } from '../neuron/types.js';
import { NeuronClientError } from '../neuron/types.js';
import type { ActivationResult } from '../activation/gate.js';
import { ActivationGate } from '../activation/gate.js';
import { validateNPI } from '../credentials/npi-validator.js';
import { generateProviderKeyPair, type ProviderKeyPair } from '../credentials/identity.js';
import {
  saveProviderProfile,
  type ProviderProfile,
} from '../credentials/profile.js';
import { createCredentialValidator } from '../credentials/validator.js';
import { loadClinicalSkills } from '../skills/loader.js';
import type { SkillLoadResult } from '../skills/types.js';

// ---------------------------------------------------------------------------
// Registration config
// ---------------------------------------------------------------------------

export interface RegistrationConfig {
  /** Workspace root directory (where CANS.md lives). */
  workspacePath: string;
  /** Skills base directory (where skill subdirs live). */
  skillsDir: string;
  /** The audit pipeline for logging all decisions. */
  audit: AuditPipeline;
  /** The neuron client for Axon registration. */
  neuronClient: NeuronClient;
  /** Neuron server endpoint URL. */
  neuronEndpoint: string;
  /** 10-digit NPI. */
  npi: string;
  /** Provider display name. */
  providerName: string;
  /** Provider type IDs from taxonomy. */
  providerTypes: string[];
  /** Optional specialty. */
  specialty?: string;
  /** Provider credentials for Axon. */
  credentials?: NeuronCredential[];
}

// ---------------------------------------------------------------------------
// Registration result
// ---------------------------------------------------------------------------

export interface RegistrationResult {
  success: boolean;
  /** Registration error code (if failed). */
  errorCode?: RegistrationErrorCode;
  /** Human-readable error message (if failed). */
  error?: string;
  /** NPI validation result. */
  npiValid?: boolean;
  /** Generated Ed25519 key pair. */
  keyPair?: ProviderKeyPair;
  /** DID received from Axon registry. */
  did?: string;
  /** Neuron registration ID. */
  registrationId?: string;
  /** CANS.md activation result. */
  activation?: ActivationResult;
  /** Clinical skill load results. */
  skills?: SkillLoadResult[];
  /** Persisted provider profile. */
  profile?: ProviderProfile;
}

export type RegistrationErrorCode =
  | 'INVALID_NPI'
  | 'AXON_UNREACHABLE'
  | 'NPI_ALREADY_REGISTERED'
  | 'REGISTRATION_REJECTED'
  | 'ACTIVATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'KEY_GENERATION_FAILED'
  | 'NEURON_ERROR';

// ---------------------------------------------------------------------------
// Registration orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute the full provider registration flow.
 *
 * Steps:
 * 1. Validate NPI (format + Luhn)
 * 2. Generate Ed25519 key pair
 * 3. Register with neuron → Axon (receive DID)
 * 4. Run CANS.md 4-step activation gate
 * 5. Load clinical skills (6-step pipeline)
 * 6. Persist provider profile
 *
 * @param config - Registration configuration
 * @returns Registration result with all outcomes
 */
export async function registerProvider(
  config: RegistrationConfig,
): Promise<RegistrationResult> {
  const traceId = config.audit.createTraceId();

  // -------------------------------------------------------------------------
  // Step 1: Validate NPI
  // -------------------------------------------------------------------------

  const npiResult = validateNPI(config.npi);

  config.audit.log({
    action: 'registration_npi_validation',
    actor: 'system',
    outcome: npiResult.valid ? 'allowed' : 'denied',
    details: {
      npi: config.npi,
      valid: npiResult.valid,
      reason: npiResult.reason,
    },
    trace_id: traceId,
  });

  if (!npiResult.valid) {
    return {
      success: false,
      errorCode: 'INVALID_NPI',
      error: npiResult.reason || 'NPI validation failed',
      npiValid: false,
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: Generate Ed25519 key pair
  // -------------------------------------------------------------------------

  let keyPair: ProviderKeyPair;
  try {
    keyPair = generateProviderKeyPair();
    config.audit.log({
      action: 'registration_keygen',
      actor: 'system',
      outcome: 'allowed',
      details: { public_key_prefix: keyPair.publicKey.substring(0, 8) + '...' },
      trace_id: traceId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    config.audit.log({
      action: 'registration_keygen',
      actor: 'system',
      outcome: 'error',
      details: { error: msg },
      trace_id: traceId,
    });
    return {
      success: false,
      errorCode: 'KEY_GENERATION_FAILED',
      error: `Key generation failed: ${msg}`,
      npiValid: true,
    };
  }

  // -------------------------------------------------------------------------
  // Step 3: Register with neuron → Axon
  // -------------------------------------------------------------------------

  let registrationId: string;
  let did: string | undefined;

  try {
    const result = await config.neuronClient.register({
      neuronEndpoint: config.neuronEndpoint,
      providerNpi: config.npi,
      providerName: config.providerName,
      providerTypes: config.providerTypes,
      specialty: config.specialty,
      credentials: config.credentials,
    });

    registrationId = result.registrationId;
    did = result.providerDid;

    config.audit.log({
      action: 'registration_neuron',
      actor: 'system',
      outcome: 'allowed',
      details: {
        registration_id: registrationId,
        did,
        status: result.status,
      },
      trace_id: traceId,
    });
  } catch (err) {
    const isNeuronError = err instanceof NeuronClientError;
    const code = isNeuronError ? err.code : 'NEURON_ERROR';
    const msg = err instanceof Error ? err.message : String(err);

    const errorCode = mapNeuronErrorToRegistrationError(code);

    config.audit.log({
      action: 'registration_neuron',
      actor: 'system',
      outcome: 'error',
      details: {
        error_code: code,
        error: msg,
        status_code: isNeuronError ? err.statusCode : undefined,
      },
      trace_id: traceId,
    });

    return {
      success: false,
      errorCode,
      error: msg,
      npiValid: true,
      keyPair,
    };
  }

  // -------------------------------------------------------------------------
  // Step 4: CANS.md 4-step activation gate
  // -------------------------------------------------------------------------

  const gate = new ActivationGate(config.workspacePath, (entry) =>
    config.audit.log({
      action: entry.action as string,
      actor: 'system',
      outcome: (entry.outcome as 'error') || 'error',
      details: entry.details as Record<string, unknown> | undefined,
      trace_id: traceId,
    }),
  );

  const activation = gate.check();

  config.audit.log({
    action: 'registration_activation',
    actor: 'system',
    outcome: activation.active ? 'active' : 'inactive',
    details: {
      active: activation.active,
      reason: activation.reason,
      provider: activation.document?.provider.name,
    },
    trace_id: traceId,
  });

  if (!activation.active) {
    // Registration succeeded but activation failed — still save profile
    const profile: ProviderProfile = {
      npi: config.npi,
      did,
      provider_name: config.providerName,
      provider_types: config.providerTypes,
      specialty: config.specialty,
      neuron_endpoint: config.neuronEndpoint,
      neuron_registration_id: registrationId,
      public_key: keyPair.publicKey,
      activation_status: 'failed',
      credential_status: 'pending',
      registered_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    };

    saveProviderProfile(config.workspacePath, profile);

    return {
      success: false,
      errorCode: 'ACTIVATION_FAILED',
      error: activation.reason || 'CANS.md activation gate failed',
      npiValid: true,
      keyPair,
      did,
      registrationId,
      activation,
      profile,
    };
  }

  // -------------------------------------------------------------------------
  // Step 5: Load clinical skills (6-step pipeline)
  // -------------------------------------------------------------------------

  let skills: SkillLoadResult[] = [];
  try {
    const validator = createCredentialValidator();
    skills = loadClinicalSkills(
      config.skillsDir,
      activation.document!,
      validator,
      config.audit,
    );

    config.audit.log({
      action: 'registration_skills',
      actor: 'system',
      outcome: 'allowed',
      details: {
        total: skills.length,
        loaded: skills.filter((s) => s.loaded).length,
        blocked: skills.filter((s) => !s.loaded).length,
      },
      trace_id: traceId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    config.audit.log({
      action: 'registration_skills',
      actor: 'system',
      outcome: 'error',
      details: { error: msg },
      trace_id: traceId,
    });
    // Skill loading is non-fatal — continue with registration
  }

  // -------------------------------------------------------------------------
  // Step 6: Persist provider profile
  // -------------------------------------------------------------------------

  const profile: ProviderProfile = {
    npi: config.npi,
    did,
    provider_name: config.providerName,
    provider_types: config.providerTypes,
    specialty: config.specialty,
    neuron_endpoint: config.neuronEndpoint,
    neuron_registration_id: registrationId,
    public_key: keyPair.publicKey,
    activation_status: 'active',
    credential_status: 'active',
    registered_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };

  saveProviderProfile(config.workspacePath, profile);

  config.audit.log({
    action: 'registration_complete',
    actor: 'system',
    outcome: 'active',
    details: {
      npi: config.npi,
      did,
      registration_id: registrationId,
      activation_status: 'active',
      skills_loaded: skills.filter((s) => s.loaded).length,
    },
    trace_id: traceId,
  });

  return {
    success: true,
    npiValid: true,
    keyPair,
    did,
    registrationId,
    activation,
    skills,
    profile,
  };
}

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapNeuronErrorToRegistrationError(
  code: string,
): RegistrationErrorCode {
  switch (code) {
    case 'CONNECTION_FAILED':
    case 'TIMEOUT':
    case 'AXON_UNREACHABLE':
      return 'AXON_UNREACHABLE';
    case 'NPI_ALREADY_REGISTERED':
      return 'NPI_ALREADY_REGISTERED';
    case 'REGISTRATION_REJECTED':
      return 'REGISTRATION_REJECTED';
    default:
      return 'NEURON_ERROR';
  }
}

// ---------------------------------------------------------------------------
// Re-export profile loader for convenience
// ---------------------------------------------------------------------------

export { loadProviderProfile } from '../credentials/profile.js';
