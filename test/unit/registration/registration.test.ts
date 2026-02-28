import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerProvider } from '../../../src/registration/registration.js';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import { NeuronClientError } from '../../../src/neuron/types.js';
import type { NeuronClient } from '../../../src/neuron/types.js';
import {
  createTestWorkspace,
  syntheticNeurosurgeonCANS,
} from '../../fixtures/synthetic-neurosurgeon.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockNeuronClient(overrides?: Partial<NeuronClient>): NeuronClient {
  return {
    register: vi.fn().mockResolvedValue({
      registrationId: 'reg-mock-001',
      status: 'registered',
      providerDid: 'did:careagent:1234567893',
    }),
    heartbeat: vi.fn().mockResolvedValue({ connected: true }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function readAuditEntries(workspacePath: string): Array<Record<string, unknown>> {
  const auditPath = join(workspacePath, '.careagent', 'AUDIT.log');
  if (!existsSync(auditPath)) return [];
  const content = readFileSync(auditPath, 'utf-8');
  return content
    .trimEnd()
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerProvider', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-reg-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // AC1: Registration flow (NPI → neuron → Axon → DID)
  // -------------------------------------------------------------------------

  describe('successful registration flow', () => {
    it('completes full registration: NPI validate → keygen → neuron register → activate → skills → profile', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Sarah Chen',
        providerTypes: ['Physician'],
        specialty: 'Neurosurgery',
      });

      expect(result.success).toBe(true);
      expect(result.npiValid).toBe(true);
      expect(result.keyPair).toBeDefined();
      expect(result.keyPair!.publicKey).toHaveLength(43);
      expect(result.did).toBe('did:careagent:1234567893');
      expect(result.registrationId).toBe('reg-mock-001');
      expect(result.activation).toBeDefined();
      expect(result.activation!.active).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.profile!.activation_status).toBe('active');
    });

    it('sends correct payload to neuron client', async () => {
      createTestWorkspace(tmpDir);

      const registerFn = vi.fn().mockResolvedValue({
        registrationId: 'reg-payload-test',
        status: 'registered',
        providerDid: 'did:careagent:1234567893',
      });
      const neuronClient = createMockNeuronClient({ register: registerFn });
      const audit = new AuditPipeline(tmpDir);

      await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
        specialty: 'Internal Medicine',
        credentials: [
          {
            type: 'license',
            issuer: 'State Board',
            identifier: 'LIC-001',
            status: 'active',
          },
        ],
      });

      expect(registerFn).toHaveBeenCalledWith({
        neuronEndpoint: 'http://neuron:3000',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
        specialty: 'Internal Medicine',
        credentials: [
          {
            type: 'license',
            issuer: 'State Board',
            identifier: 'LIC-001',
            status: 'active',
          },
        ],
      });
    });
  });

  // -------------------------------------------------------------------------
  // AC2: CANS.md activation gate (4-step pipeline)
  // -------------------------------------------------------------------------

  describe('CANS.md activation gate', () => {
    it('runs 4-step activation gate during registration', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.activation).toBeDefined();
      expect(result.activation!.active).toBe(true);
      expect(result.activation!.document).not.toBeNull();
    });

    it('returns ACTIVATION_FAILED when CANS.md is missing', async () => {
      // Don't create test workspace — no CANS.md
      mkdirSync(join(tmpDir, '.careagent'), { recursive: true });

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ACTIVATION_FAILED');
      // Registration still succeeded (DID received)
      expect(result.did).toBe('did:careagent:1234567893');
      // Profile saved with failed activation status
      expect(result.profile).toBeDefined();
      expect(result.profile!.activation_status).toBe('failed');
    });

    it('returns ACTIVATION_FAILED when CANS.md is malformed', async () => {
      writeFileSync(
        join(tmpDir, 'CANS.md'),
        '---\nversion: "1.0"\nprovider:\n  name: "Incomplete"\n---\n\nBad CANS.',
      );
      mkdirSync(join(tmpDir, '.careagent'), { recursive: true });

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ACTIVATION_FAILED');
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Ed25519 key pair generation
  // -------------------------------------------------------------------------

  describe('Ed25519 key pair generation', () => {
    it('generates a key pair during registration', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.keyPair).toBeDefined();
      expect(result.keyPair!.publicKey).toHaveLength(43);
      expect(result.keyPair!.privateKey).toHaveLength(43);
    });
  });

  // -------------------------------------------------------------------------
  // AC5: Provider profile stored locally
  // -------------------------------------------------------------------------

  describe('provider profile persistence', () => {
    it('saves profile with NPI, DID, neuron endpoint, and activation status', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Sarah Chen',
        providerTypes: ['Physician'],
        specialty: 'Neurosurgery',
      });

      const profilePath = join(tmpDir, '.careagent', 'provider-profile.json');
      expect(existsSync(profilePath)).toBe(true);

      const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
      expect(profile.npi).toBe('1234567893');
      expect(profile.did).toBe('did:careagent:1234567893');
      expect(profile.neuron_endpoint).toBe('http://neuron:3000');
      expect(profile.activation_status).toBe('active');
      expect(profile.public_key).toBe(result.keyPair!.publicKey);
    });
  });

  // -------------------------------------------------------------------------
  // AC6: NPI validation (Luhn check)
  // -------------------------------------------------------------------------

  describe('NPI validation', () => {
    it('rejects invalid NPI format', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '123',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_NPI');
      expect(result.npiValid).toBe(false);
    });

    it('rejects NPI with bad Luhn check digit', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567890', // fails Luhn
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_NPI');
    });

    it('does not call neuron register when NPI is invalid', async () => {
      createTestWorkspace(tmpDir);

      const registerFn = vi.fn();
      const neuronClient = createMockNeuronClient({ register: registerFn });
      const audit = new AuditPipeline(tmpDir);

      await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: 'not-an-npi',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(registerFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AC7: Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns AXON_UNREACHABLE when neuron cannot reach Axon', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient({
        register: vi.fn().mockRejectedValue(
          new NeuronClientError('Axon unreachable', 'CONNECTION_FAILED'),
        ),
      });
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AXON_UNREACHABLE');
      expect(result.keyPair).toBeDefined(); // Key pair was generated before neuron call
    });

    it('returns NPI_ALREADY_REGISTERED when NPI is taken', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient({
        register: vi.fn().mockRejectedValue(
          new NeuronClientError('NPI already registered', 'NPI_ALREADY_REGISTERED', { statusCode: 409 }),
        ),
      });
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NPI_ALREADY_REGISTERED');
    });

    it('returns REGISTRATION_REJECTED when credentials are invalid', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient({
        register: vi.fn().mockRejectedValue(
          new NeuronClientError('Invalid credentials', 'REGISTRATION_REJECTED', { statusCode: 400 }),
        ),
      });
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('REGISTRATION_REJECTED');
    });

    it('returns NEURON_ERROR for unexpected neuron failures', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient({
        register: vi.fn().mockRejectedValue(new Error('unexpected failure')),
      });
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NEURON_ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // AC8: Skill loading pipeline (6 steps)
  // -------------------------------------------------------------------------

  describe('skill loading pipeline', () => {
    it('loads skills during registration when workspace has skills directory', async () => {
      createTestWorkspace(tmpDir);

      // Create a chart-skill with proper manifest
      const skillsDir = join(tmpDir, 'skills', 'chart-skill');
      mkdirSync(skillsDir, { recursive: true });

      const skillContent = '# Chart Skill\n\nA clinical charting skill.\n';
      writeFileSync(join(skillsDir, 'SKILL.md'), skillContent);

      const skillHash = createHash('sha256').update(skillContent, 'utf-8').digest('hex');
      const manifest = {
        skill_id: 'chart-skill',
        version: '1.0.0',
        requires: {
          license: ['MD', 'DO'],
          specialty: ['Neurosurgery'],
          privilege: ['neurosurgical procedures'],
        },
        files: { 'SKILL.md': skillHash },
        pinned: true,
        approved_version: '1.0.0',
      };
      writeFileSync(join(skillsDir, 'skill-manifest.json'), JSON.stringify(manifest, null, 2));

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Sarah Chen',
        providerTypes: ['Physician'],
        specialty: 'Neurosurgery',
      });

      expect(result.skills).toBeDefined();
      expect(result.skills!.length).toBeGreaterThan(0);
      const chartSkill = result.skills!.find((s) => s.skillId === 'chart-skill');
      expect(chartSkill).toBeDefined();
      expect(chartSkill!.loaded).toBe(true);
    });

    it('continues registration even when no skills directory exists', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      const result = await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'nonexistent-skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      expect(result.success).toBe(true);
      expect(result.skills).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // AC9: Audit logging
  // -------------------------------------------------------------------------

  describe('audit logging', () => {
    it('logs all registration steps to audit trail', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      const entries = readAuditEntries(tmpDir);
      const actions = entries.map((e) => e.action);

      expect(actions).toContain('registration_npi_validation');
      expect(actions).toContain('registration_keygen');
      expect(actions).toContain('registration_neuron');
      expect(actions).toContain('registration_activation');
      expect(actions).toContain('registration_skills');
      expect(actions).toContain('registration_complete');
    });

    it('all registration audit entries share the same trace_id', async () => {
      createTestWorkspace(tmpDir);

      const neuronClient = createMockNeuronClient();
      const audit = new AuditPipeline(tmpDir);

      await registerProvider({
        workspacePath: tmpDir,
        skillsDir: join(tmpDir, 'skills'),
        audit,
        neuronClient,
        neuronEndpoint: 'http://neuron:3000',
        npi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['Physician'],
      });

      const entries = readAuditEntries(tmpDir);
      const registrationEntries = entries.filter(
        (e) => typeof e.action === 'string' && (e.action as string).startsWith('registration_'),
      );

      expect(registrationEntries.length).toBeGreaterThan(0);
      const traceIds = new Set(registrationEntries.map((e) => e.trace_id));
      expect(traceIds.size).toBe(1);
    });
  });
});
