/**
 * Credentials module — re-exports types and factory.
 */

export type { CredentialValidator, CredentialCheckResult } from './types.js';
export { createCredentialValidator } from './validator.js';

// NPI validation
export { validateNPI } from './npi-validator.js';
export type { NPIValidationResult } from './npi-validator.js';

// Ed25519 identity
export { generateProviderKeyPair } from './identity.js';
export type { ProviderKeyPair } from './identity.js';

// Provider profile
export { loadProviderProfile, saveProviderProfile, ProviderProfileSchema } from './profile.js';
export type { ProviderProfile } from './profile.js';
