/**
 * Message signer — Ed25519 signing for outgoing clinical messages.
 *
 * Covers:
 * - MSG-05: Every outgoing message is signed with the provider's Ed25519 private key
 * - Signature is base64url-encoded and included in the message envelope
 *
 * Signs the canonical JSON representation of the message payload.
 * Uses Node.js built-in crypto module — zero runtime dependencies.
 */

import { sign, createPrivateKey } from 'node:crypto';

// Ed25519 PKCS8 DER prefix for wrapping a 32-byte raw private key
const PKCS8_ED25519_PREFIX = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * Sign a message payload with the provider's Ed25519 private key.
 *
 * The signature is computed over the canonical JSON representation
 * (JSON.stringify with sorted keys) of the payload, ensuring deterministic
 * signature verification.
 *
 * @param payload - The message payload to sign (will be JSON-stringified)
 * @param privateKeyBase64url - The provider's base64url-encoded Ed25519 private key
 * @returns base64url-encoded Ed25519 signature
 */
export function signMessage(
  payload: unknown,
  privateKeyBase64url: string,
): string {
  // Canonical JSON: sorted keys for deterministic signing
  const canonical = JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort());
  const data = Buffer.from(canonical, 'utf-8');

  // Import the Ed25519 private key from base64url via PKCS8 DER wrapping
  const privKeyBytes = Buffer.from(privateKeyBase64url, 'base64url');
  const derKey = Buffer.concat([PKCS8_ED25519_PREFIX, privKeyBytes]);

  const keyObject = createPrivateKey({
    key: derKey,
    format: 'der',
    type: 'pkcs8',
  });

  const signature = sign(null, data, keyObject);
  return signature.toString('base64url');
}

/**
 * Create the canonical bytes of a payload for signing/verification.
 *
 * @param payload - The payload object
 * @returns UTF-8 encoded canonical JSON
 */
export function canonicalize(payload: unknown): Buffer {
  const canonical = JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort());
  return Buffer.from(canonical, 'utf-8');
}
