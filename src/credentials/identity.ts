/**
 * Ed25519 identity — key pair generation for provider consent tokens
 * and message signing.
 *
 * Uses Node.js built-in crypto module (node:crypto) for Ed25519 key
 * generation. Keys are exported as base64url-encoded raw bytes for
 * compact storage and compatibility with the Axon protocol.
 *
 * Zero runtime dependencies — Node.js built-ins only.
 */

import { generateKeyPairSync } from 'node:crypto';

/** An Ed25519 key pair with base64url-encoded keys. */
export interface ProviderKeyPair {
  /** base64url-encoded 32-byte Ed25519 public key. */
  publicKey: string;
  /** base64url-encoded 32-byte Ed25519 private key. */
  privateKey: string;
}

/**
 * Generate an Ed25519 key pair for provider identity.
 *
 * Used for signing consent tokens and authenticating messages in the
 * CareAgent protocol. Keys are returned as base64url-encoded raw
 * bytes (32 bytes each → 43 base64url characters).
 *
 * @returns A ProviderKeyPair with base64url-encoded public and private keys.
 */
export function generateProviderKeyPair(): ProviderKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  // Export as JWK to extract raw key bytes
  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });

  if (!pubJwk.x || !privJwk.d) {
    throw new Error('Ed25519 key generation failed: missing JWK fields');
  }

  return {
    publicKey: pubJwk.x,
    privateKey: privJwk.d,
  };
}
