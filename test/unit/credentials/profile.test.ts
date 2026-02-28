import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadProviderProfile,
  saveProviderProfile,
  type ProviderProfile,
} from '../../../src/credentials/profile.js';

describe('Provider Profile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-profile-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // saveProviderProfile
  // -------------------------------------------------------------------------

  describe('saveProviderProfile', () => {
    it('writes profile to .careagent/provider-profile.json', () => {
      const profile: ProviderProfile = {
        npi: '1234567893',
        provider_name: 'Dr. Test',
        provider_types: ['physician'],
        activation_status: 'active',
        last_updated: '2026-01-01T00:00:00Z',
      };

      saveProviderProfile(tmpDir, profile);

      const filePath = join(tmpDir, '.careagent', 'provider-profile.json');
      expect(existsSync(filePath)).toBe(true);

      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.npi).toBe('1234567893');
      expect(parsed.provider_name).toBe('Dr. Test');
    });

    it('creates .careagent directory if it does not exist', () => {
      const profile: ProviderProfile = {
        npi: '1234567893',
        provider_name: 'Dr. Test',
        provider_types: ['physician'],
        activation_status: 'pending',
        last_updated: '2026-01-01T00:00:00Z',
      };

      saveProviderProfile(tmpDir, profile);
      expect(existsSync(join(tmpDir, '.careagent'))).toBe(true);
    });

    it('writes all fields including optional ones', () => {
      const profile: ProviderProfile = {
        npi: '1234567893',
        did: 'did:careagent:1234567893',
        provider_name: 'Dr. Sarah Chen',
        provider_types: ['physician'],
        specialty: 'Neurosurgery',
        neuron_endpoint: 'http://neuron:3000',
        neuron_registration_id: 'reg-001',
        public_key: 'abc123def456',
        activation_status: 'active',
        credential_status: 'active',
        registered_at: '2026-01-01T00:00:00Z',
        last_updated: '2026-01-01T00:00:00Z',
      };

      saveProviderProfile(tmpDir, profile);

      const filePath = join(tmpDir, '.careagent', 'provider-profile.json');
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(parsed.did).toBe('did:careagent:1234567893');
      expect(parsed.neuron_endpoint).toBe('http://neuron:3000');
      expect(parsed.public_key).toBe('abc123def456');
    });

    it('overwrites existing profile', () => {
      const profile1: ProviderProfile = {
        npi: '1234567893',
        provider_name: 'Dr. Original',
        provider_types: ['physician'],
        activation_status: 'pending',
        last_updated: '2026-01-01T00:00:00Z',
      };
      saveProviderProfile(tmpDir, profile1);

      const profile2: ProviderProfile = {
        npi: '1234567893',
        provider_name: 'Dr. Updated',
        provider_types: ['physician'],
        activation_status: 'active',
        last_updated: '2026-01-02T00:00:00Z',
      };
      saveProviderProfile(tmpDir, profile2);

      const loaded = loadProviderProfile(tmpDir);
      expect(loaded!.provider_name).toBe('Dr. Updated');
      expect(loaded!.activation_status).toBe('active');
    });
  });

  // -------------------------------------------------------------------------
  // loadProviderProfile
  // -------------------------------------------------------------------------

  describe('loadProviderProfile', () => {
    it('returns null when no profile exists', () => {
      const result = loadProviderProfile(tmpDir);
      expect(result).toBeNull();
    });

    it('returns null when profile file is invalid JSON', () => {
      const dir = join(tmpDir, '.careagent');
      const { mkdirSync, writeFileSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'provider-profile.json'), 'not json', 'utf-8');

      const result = loadProviderProfile(tmpDir);
      expect(result).toBeNull();
    });

    it('returns null when profile fails schema validation', () => {
      const dir = join(tmpDir, '.careagent');
      const { mkdirSync, writeFileSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'provider-profile.json'),
        JSON.stringify({ npi: 'bad', activation_status: 'invalid' }),
        'utf-8',
      );

      const result = loadProviderProfile(tmpDir);
      expect(result).toBeNull();
    });

    it('round-trips a valid profile', () => {
      const profile: ProviderProfile = {
        npi: '1245319599',
        did: 'did:careagent:1245319599',
        provider_name: 'Dr. Chen',
        provider_types: ['physician'],
        specialty: 'Neurosurgery',
        neuron_endpoint: 'http://neuron:3000',
        neuron_registration_id: 'reg-123',
        public_key: 'testkey123',
        activation_status: 'active',
        credential_status: 'active',
        registered_at: '2026-01-01T00:00:00Z',
        last_updated: '2026-01-01T00:00:00Z',
      };

      saveProviderProfile(tmpDir, profile);
      const loaded = loadProviderProfile(tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.npi).toBe('1245319599');
      expect(loaded!.did).toBe('did:careagent:1245319599');
      expect(loaded!.specialty).toBe('Neurosurgery');
      expect(loaded!.activation_status).toBe('active');
    });
  });
});
