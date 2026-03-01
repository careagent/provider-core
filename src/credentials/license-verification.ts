/**
 * License Verification — background process stub.
 *
 * Future implementation will:
 * 1. Query state medical board APIs to verify license legitimacy
 * 2. Confirm license is in good standing (not suspended/revoked)
 * 3. Update credential_status in CANS.md from 'pending' → 'active'
 * 4. Run periodically to catch license expirations or revocations
 * 5. Emit audit events for any status changes
 *
 * This replaces the self-reported credential_status question that was
 * previously asked during onboarding. Providers should not self-attest
 * to license validity — that must be independently verified.
 *
 * Data sources to integrate:
 * - State medical board lookup (per license state code)
 * - NPDB (National Practitioner Data Bank) for adverse actions
 * - DEA registration verification
 * - Board certification verification (ABMS, AOA, etc.)
 */

import type { Provider } from '../activation/cans-schema.js';

export type VerificationStatus = 'verified' | 'pending' | 'failed' | 'expired' | 'revoked';

export interface LicenseVerificationResult {
  license: string;
  state: string;
  status: VerificationStatus;
  verified_at?: string;
  expires_at?: string;
  failure_reason?: string;
}

export interface ProviderVerificationReport {
  provider_npi: string;
  overall_status: VerificationStatus;
  licenses: LicenseVerificationResult[];
  checked_at: string;
}

/**
 * Verify all licenses for a provider. Stub — returns pending for all.
 */
export async function verifyProviderLicenses(
  _provider: Provider,
): Promise<ProviderVerificationReport> {
  // TODO: Implement actual state board API integrations
  return {
    provider_npi: _provider.npi ?? 'unknown',
    overall_status: 'pending',
    licenses: (_provider.licenses ?? []).map((lic) => ({
      license: lic,
      state: lic.split('-')[0] ?? 'unknown',
      status: 'pending' as const,
    })),
    checked_at: new Date().toISOString(),
  };
}
