/**
 * Provider profile — TypeBox schema and local persistence for the
 * registered provider's identity and activation state.
 *
 * The profile stores NPI, DID, neuron endpoint, Ed25519 public key,
 * activation status, and registration metadata. It is written to
 * `.careagent/provider-profile.json` in the workspace directory.
 *
 * Zero runtime dependencies — Node.js built-ins only.
 */

import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// TypeBox Schema
// ---------------------------------------------------------------------------

export const ProviderProfileSchema = Type.Object({
  npi: Type.String({ pattern: '^[0-9]{10}$' }),
  did: Type.Optional(Type.String({ description: 'Decentralized Identifier from Axon registry' })),
  provider_name: Type.String({ minLength: 1 }),
  provider_types: Type.Array(Type.String({ minLength: 1 })),
  specialty: Type.Optional(Type.String()),
  neuron_endpoint: Type.Optional(Type.String({ description: 'Neuron server URL' })),
  neuron_registration_id: Type.Optional(Type.String()),
  public_key: Type.Optional(Type.String({ description: 'base64url-encoded Ed25519 public key' })),
  activation_status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('active'),
    Type.Literal('inactive'),
    Type.Literal('failed'),
  ]),
  credential_status: Type.Optional(Type.Union([
    Type.Literal('active'),
    Type.Literal('pending'),
    Type.Literal('expired'),
    Type.Literal('suspended'),
    Type.Literal('revoked'),
  ])),
  registered_at: Type.Optional(Type.String({ description: 'ISO 8601' })),
  last_updated: Type.String({ description: 'ISO 8601' }),
});

export type ProviderProfile = Static<typeof ProviderProfileSchema>;

// ---------------------------------------------------------------------------
// File path constant
// ---------------------------------------------------------------------------

const PROFILE_FILENAME = 'provider-profile.json';
const CAREAGENT_DIR = '.careagent';

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Load the provider profile from the workspace directory.
 *
 * @param workspacePath - The workspace root directory
 * @returns The provider profile, or null if it doesn't exist or is invalid
 */
export function loadProviderProfile(workspacePath: string): ProviderProfile | null {
  const profilePath = join(workspacePath, CAREAGENT_DIR, PROFILE_FILENAME);

  if (!existsSync(profilePath)) {
    return null;
  }

  try {
    const raw = readFileSync(profilePath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!Value.Check(ProviderProfileSchema, parsed)) {
      return null;
    }

    return parsed as ProviderProfile;
  } catch {
    return null;
  }
}

/**
 * Save the provider profile to the workspace directory.
 *
 * Creates the `.careagent/` directory if it doesn't exist.
 *
 * @param workspacePath - The workspace root directory
 * @param profile - The provider profile to save
 */
export function saveProviderProfile(workspacePath: string, profile: ProviderProfile): void {
  const dir = join(workspacePath, CAREAGENT_DIR);
  mkdirSync(dir, { recursive: true });

  const profilePath = join(dir, PROFILE_FILENAME);
  writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
}
