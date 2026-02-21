/**
 * Credential validator factory -- real implementation (Phase 4).
 *
 * Checks provider credentials (types, licenses, certifications, specialty,
 * privileges) against a clinical skill's required credentials. Used by the
 * skill loader to gate clinical skills at load time (SKIL-01).
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

      // 1. Provider type check
      if (requiredCredentials.types && requiredCredentials.types.length > 0) {
        const hasMatch = requiredCredentials.types.some((t) => provider.types.includes(t));
        if (!hasMatch) {
          missing.push(`type:${requiredCredentials.types.join('|')}`);
        }
      }

      // 2. Degree check
      if (requiredCredentials.degrees && requiredCredentials.degrees.length > 0) {
        const hasMatch = requiredCredentials.degrees.some((d) => provider.degrees.includes(d));
        if (!hasMatch) {
          missing.push(`degree:${requiredCredentials.degrees.join('|')}`);
        }
      }

      // 3. License check
      if (requiredCredentials.licenses && requiredCredentials.licenses.length > 0) {
        const hasMatch = requiredCredentials.licenses.some((l) => provider.licenses.includes(l));
        if (!hasMatch) {
          missing.push(`license:${requiredCredentials.licenses.join('|')}`);
        }
      }

      // 4. Certification check
      if (requiredCredentials.certifications && requiredCredentials.certifications.length > 0) {
        const hasMatch = requiredCredentials.certifications.some((c) =>
          provider.certifications.includes(c),
        );
        if (!hasMatch) {
          missing.push(`certification:${requiredCredentials.certifications.join('|')}`);
        }
      }

      // 5. Specialty check
      if (requiredCredentials.specialty && requiredCredentials.specialty.length > 0) {
        const hasMatch = requiredCredentials.specialty.some(
          (s) => s === provider.specialty || s === provider.subspecialty,
        );
        if (!hasMatch) {
          missing.push(`specialty:${requiredCredentials.specialty.join('|')}`);
        }
      }

      // 6. Privilege check (against all organizations)
      if (requiredCredentials.privilege && requiredCredentials.privilege.length > 0) {
        const allPrivileges = provider.organizations.flatMap((o) => o.privileges ?? []);
        const missingPrivileges = requiredCredentials.privilege.filter(
          (p) => !allPrivileges.includes(p),
        );
        if (missingPrivileges.length > 0) {
          missing.push(`privilege:${missingPrivileges.join(',')}`);
        }
      }

      // 7. Build result
      const valid = missing.length === 0;

      return {
        valid,
        provider: provider.name,
        types: provider.types,
        licenses: provider.licenses,
        certifications: provider.certifications,
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
