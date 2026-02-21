/**
 * Credential validator types — interfaces for provider credential verification.
 *
 * Covers SKIL-01 requirement: validate that a provider's credentials
 * (types, licenses, certifications, specialty, institutional privileges)
 * satisfy a clinical skill's minimum requirements before allowing activation.
 */

import type { CANSDocument } from '../activation/cans-schema.js';

/** Result from a credential validation check. */
export interface CredentialCheckResult {
  valid: boolean;
  provider: string;
  types: string[];
  licenses: string[];
  certifications: string[];
  specialty?: string;
  missingCredentials?: string[];
  reason?: string;
}

/**
 * The credential validator — checks provider credentials against skill requirements.
 *
 * Used by clinical skill loading to ensure a provider is qualified before
 * activating a skill (e.g., only MDs/DOs can use surgical note skills).
 */
export interface CredentialValidator {
  /** Validate provider credentials against required credentials for a skill. */
  check(
    cans: CANSDocument,
    requiredCredentials: {
      types?: string[];
      degrees?: string[];
      licenses?: string[];
      certifications?: string[];
      specialty?: string[];
      privilege?: string[];
    },
  ): CredentialCheckResult;
}
