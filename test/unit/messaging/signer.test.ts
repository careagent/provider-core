import { describe, it, expect } from 'vitest';
import { createPublicKey, verify } from 'node:crypto';
import { signMessage, canonicalize } from '../../../src/messaging/signer.js';
import { generateProviderKeyPair } from '../../../src/credentials/identity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verifySignature(payload: unknown, signatureBase64url: string, publicKeyBase64url: string): boolean {
  const canonical = canonicalize(payload);
  const sig = Buffer.from(signatureBase64url, 'base64url');

  const keyObject = createPublicKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: publicKeyBase64url,
    },
    format: 'jwk',
  });

  return verify(null, canonical, keyObject, sig);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('signMessage', () => {
  it('produces a valid Ed25519 signature', () => {
    const keyPair = generateProviderKeyPair();
    const payload = { type: 'clinical_summary', summary: 'Test message' };

    const signature = signMessage(payload, keyPair.privateKey);

    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    // Verify the signature
    const valid = verifySignature(payload, signature, keyPair.publicKey);
    expect(valid).toBe(true);
  });

  it('produces deterministic signatures for the same payload and key', () => {
    const keyPair = generateProviderKeyPair();
    const payload = { foo: 'bar', baz: 42 };

    const sig1 = signMessage(payload, keyPair.privateKey);
    const sig2 = signMessage(payload, keyPair.privateKey);

    // Ed25519 is deterministic
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different payloads', () => {
    const keyPair = generateProviderKeyPair();
    const payload1 = { message: 'hello' };
    const payload2 = { message: 'world' };

    const sig1 = signMessage(payload1, keyPair.privateKey);
    const sig2 = signMessage(payload2, keyPair.privateKey);

    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures with different keys', () => {
    const keyPair1 = generateProviderKeyPair();
    const keyPair2 = generateProviderKeyPair();
    const payload = { message: 'test' };

    const sig1 = signMessage(payload, keyPair1.privateKey);
    const sig2 = signMessage(payload, keyPair2.privateKey);

    expect(sig1).not.toBe(sig2);
  });

  it('signature verification fails with wrong public key', () => {
    const keyPair1 = generateProviderKeyPair();
    const keyPair2 = generateProviderKeyPair();
    const payload = { message: 'test' };

    const signature = signMessage(payload, keyPair1.privateKey);

    // Verify with wrong key should fail
    const valid = verifySignature(payload, signature, keyPair2.publicKey);
    expect(valid).toBe(false);
  });

  it('signature verification fails with tampered payload', () => {
    const keyPair = generateProviderKeyPair();
    const payload = { message: 'original' };

    const signature = signMessage(payload, keyPair.privateKey);

    // Verify with tampered payload should fail
    const valid = verifySignature({ message: 'tampered' }, signature, keyPair.publicKey);
    expect(valid).toBe(false);
  });

  it('signs clinical message types correctly', () => {
    const keyPair = generateProviderKeyPair();

    const clinicalSummary = {
      type: 'clinical_summary',
      summary: 'Patient stable',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    };

    const signature = signMessage(clinicalSummary, keyPair.privateKey);
    expect(verifySignature(clinicalSummary, signature, keyPair.publicKey)).toBe(true);
  });
});

describe('canonicalize', () => {
  it('returns a Buffer', () => {
    const result = canonicalize({ a: 1, b: 2 });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('produces deterministic output regardless of key order', () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };

    const buf1 = canonicalize(obj1);
    const buf2 = canonicalize(obj2);

    expect(buf1.toString()).toBe(buf2.toString());
  });
});
