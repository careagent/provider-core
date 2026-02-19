/**
 * Credential validator factory -- real implementation (Phase 4).
 *
 * Checks provider credentials (license type, specialty, privileges)
 * against a clinical skill's required credentials. Used by the skill
 * loader to gate clinical skills at load time (SKIL-01).
 *
 * Regular OpenClaw skills with no credential requirements pass
 * automatically (SKIL-02).
 */

import type { CredentialValidator } from './types.js';

/** Create a credential validator instance. */
export function createCredentialValidator(): CredentialValidator {
  return {
    check(cans, requiredCredentials) {
      const { provider } = cans;
      const missing: string[] = [];

      // 1. License check
      if (requiredCredentials.license && requiredCredentials.license.length > 0) {
        if (!requiredCredentials.license.includes(provider.license.type)) {
          missing.push(`license:${requiredCredentials.license.join('|')}`);
        }
      }

      // 2. Specialty check
      if (requiredCredentials.specialty && requiredCredentials.specialty.length > 0) {
        const hasMatch = requiredCredentials.specialty.some(
          (s) => s === provider.specialty || s === provider.subspecialty,
        );
        if (!hasMatch) {
          missing.push(`specialty:${requiredCredentials.specialty.join('|')}`);
        }
      }

      // 3. Privilege check
      if (requiredCredentials.privilege && requiredCredentials.privilege.length > 0) {
        const missingPrivileges = requiredCredentials.privilege.filter(
          (p) => !provider.privileges.includes(p),
        );
        if (missingPrivileges.length > 0) {
          missing.push(`privilege:${missingPrivileges.join(',')}`);
        }
      }

      // 4. Build result
      const valid = missing.length === 0;

      return {
        valid,
        provider: provider.name,
        licenseType: provider.license.type,
        specialty: provider.specialty,
        ...(valid
          ? {}
          : {
              missingCredentials: missing,
              reason: `Provider ${provider.name} missing required credentials: ${missing.join('; ')}`,
            }),
      };
    },
  };
}
