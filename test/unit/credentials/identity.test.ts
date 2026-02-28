import { describe, it, expect } from 'vitest';
import { createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import { generateProviderKeyPair } from '../../../src/credentials/identity.js';

describe('generateProviderKeyPair', () => {
  it('returns an object with publicKey and privateKey strings', () => {
    const keyPair = generateProviderKeyPair();
    expect(typeof keyPair.publicKey).toBe('string');
    expect(typeof keyPair.privateKey).toBe('string');
  });

  it('generates base64url-encoded 32-byte public key (43 characters)', () => {
    const keyPair = generateProviderKeyPair();
    // Ed25519 public key is 32 bytes → 43 base64url characters
    expect(keyPair.publicKey).toHaveLength(43);
    expect(keyPair.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates base64url-encoded 32-byte private key (43 characters)', () => {
    const keyPair = generateProviderKeyPair();
    // Ed25519 private key seed is 32 bytes → 43 base64url characters
    expect(keyPair.privateKey).toHaveLength(43);
    expect(keyPair.privateKey).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique key pairs on each call', () => {
    const pair1 = generateProviderKeyPair();
    const pair2 = generateProviderKeyPair();
    expect(pair1.publicKey).not.toBe(pair2.publicKey);
    expect(pair1.privateKey).not.toBe(pair2.privateKey);
  });

  it('generated key pair can sign and verify messages', () => {
    const keyPair = generateProviderKeyPair();

    // Reconstruct key objects from base64url
    const privKeyObj = createPrivateKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        d: keyPair.privateKey,
        x: keyPair.publicKey,
      },
      format: 'jwk',
    });

    const pubKeyObj = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: keyPair.publicKey,
      },
      format: 'jwk',
    });

    const message = Buffer.from('test message for CareAgent');
    const signature = sign(null, message, privKeyObj);
    const isValid = verify(null, message, pubKeyObj, signature);

    expect(isValid).toBe(true);
  });

  it('verification fails with wrong message', () => {
    const keyPair = generateProviderKeyPair();

    const privKeyObj = createPrivateKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        d: keyPair.privateKey,
        x: keyPair.publicKey,
      },
      format: 'jwk',
    });

    const pubKeyObj = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: keyPair.publicKey,
      },
      format: 'jwk',
    });

    const message = Buffer.from('original message');
    const signature = sign(null, message, privKeyObj);

    const tamperedMessage = Buffer.from('tampered message');
    const isValid = verify(null, tamperedMessage, pubKeyObj, signature);

    expect(isValid).toBe(false);
  });

  it('verification fails with wrong public key', () => {
    const keyPair1 = generateProviderKeyPair();
    const keyPair2 = generateProviderKeyPair();

    const privKeyObj1 = createPrivateKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        d: keyPair1.privateKey,
        x: keyPair1.publicKey,
      },
      format: 'jwk',
    });

    const pubKeyObj2 = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: keyPair2.publicKey,
      },
      format: 'jwk',
    });

    const message = Buffer.from('test message');
    const signature = sign(null, message, privKeyObj1);
    const isValid = verify(null, message, pubKeyObj2, signature);

    expect(isValid).toBe(false);
  });
});
