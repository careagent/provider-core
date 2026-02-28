import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPublicKey, verify } from 'node:crypto';
import { AuditPipeline } from '../../../src/audit/pipeline.js';
import { generateProviderKeyPair } from '../../../src/credentials/identity.js';
import { createMessagingPipeline } from '../../../src/messaging/pipeline.js';
import { canonicalize } from '../../../src/messaging/signer.js';
import type { InjectaVoxData, ClinicalMessage } from '../../../src/messaging/schemas.js';

// ---------------------------------------------------------------------------
// Mock WebSocket that succeeds
// ---------------------------------------------------------------------------

type WsListener = (event: unknown) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  private listeners: Record<string, WsListener[]> = {};
  sentData: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => this.emit('open', {}), 2);
  }

  addEventListener(event: string, listener: WsListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  send(data: string): void {
    this.sentData.push(data);
    setTimeout(() => this.emit('message', { data: '{"ack":true}' }), 2);
  }

  close(): void {}

  emit(event: string, data: unknown): void {
    for (const listener of this.listeners[event] || []) {
      listener(data);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
}

function makeInjectaVoxData(overrides: Partial<InjectaVoxData> = {}): InjectaVoxData {
  return {
    patient_agent_id: 'patient-001',
    encounter_id: 'enc-001',
    provider_npi: '1234567893',
    provider_name: 'Dr. Smith',
    timestamp: '2026-02-28T10:00:00Z',
    data_type: 'encounter_summary',
    clinical_data: {
      diagnoses: [{ code: 'J06.9', display: 'URI' }],
      follow_up: 'Return in 2 weeks',
    },
    narrative: 'Patient seen for upper respiratory infection',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMessagingPipeline', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let tempDir: string;
  let audit: AuditPipeline;
  let keyPair: ReturnType<typeof generateProviderKeyPair>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('WebSocket', MockWebSocket);

    tempDir = mkdtempSync(join(tmpdir(), 'msg-pipeline-'));
    audit = new AuditPipeline(tempDir);
    keyPair = generateProviderKeyPair();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createPipeline(overrides: Record<string, unknown> = {}) {
    return createMessagingPipeline({
      audit,
      providerPrivateKey: keyPair.privateKey,
      providerPublicKey: keyPair.publicKey,
      neuronEndpoint: 'http://neuron:3000',
      patientEndpoint: 'ws://patient:8080',
      ...overrides,
    });
  }

  // -------------------------------------------------------------------------
  // Full pipeline: send()
  // -------------------------------------------------------------------------

  describe('send()', () => {
    it('completes the full pipeline successfully', async () => {
      // Mock consent check
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          allowed: true,
          relationship_id: 'rel-001',
          scope: ['send_clinical_message'],
        }),
      );

      const pipeline = createPipeline();
      const result = await pipeline.send(makeInjectaVoxData());

      expect(result.success).toBe(true);
      expect(result.message_id).toBeTruthy();
      expect(result.correlation_id).toBeTruthy();
      expect(result.attempts).toBe(1);
    });

    it('generates a unique correlation_id for each send', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ allowed: true, relationship_id: 'rel-001' }),
      );

      const pipeline = createPipeline();
      const result1 = await pipeline.send(makeInjectaVoxData());
      const result2 = await pipeline.send(makeInjectaVoxData());

      expect(result1.correlation_id).not.toBe(result2.correlation_id);
      expect(result1.message_id).not.toBe(result2.message_id);
    });

    it('sends a signed envelope via WebSocket', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true, relationship_id: 'rel-001' }),
      );

      const pipeline = createPipeline();
      await pipeline.send(makeInjectaVoxData());

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].sentData).toHaveLength(1);

      const envelope = JSON.parse(MockWebSocket.instances[0].sentData[0]);
      expect(envelope.version).toBe('1');
      expect(envelope.message_id).toBeTruthy();
      expect(envelope.correlation_id).toBeTruthy();
      expect(envelope.sender_public_key).toBe(keyPair.publicKey);
      expect(envelope.patient_agent_id).toBe('patient-001');
      expect(envelope.payload.type).toBe('clinical_summary');
      expect(envelope.signature).toBeTruthy();
    });

    it('produces a verifiable Ed25519 signature', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      const pipeline = createPipeline();
      await pipeline.send(makeInjectaVoxData());

      const envelope = JSON.parse(MockWebSocket.instances[0].sentData[0]);
      const canonical = canonicalize(envelope.payload);
      const sig = Buffer.from(envelope.signature, 'base64url');

      const pubKey = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: keyPair.publicKey },
        format: 'jwk',
      });

      const valid = verify(null, canonical, pubKey, sig);
      expect(valid).toBe(true);
    });

    it('logs to audit trail on success', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true, relationship_id: 'rel-001' }),
      );

      const pipeline = createPipeline();
      await pipeline.send(makeInjectaVoxData());

      // Read audit log
      const logPath = join(tempDir, '.careagent', 'AUDIT.log');
      const logContent = readFileSync(logPath, 'utf-8');
      const entries = logContent.trim().split('\n').map((l) => JSON.parse(l));

      // Should have: message_generated, message_consent_verified, message_sent
      const actions = entries.map((e: Record<string, unknown>) => e.action);
      expect(actions).toContain('message_generated');
      expect(actions).toContain('message_consent_verified');
      expect(actions).toContain('message_sent');

      // Verify correlation IDs are present
      const sentEntry = entries.find((e: Record<string, unknown>) => e.action === 'message_sent');
      expect(sentEntry.details.correlation_id).toBeTruthy();
      expect(sentEntry.details.message_id).toBeTruthy();
    });

    it('hash-chains audit entries', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      const pipeline = createPipeline();
      await pipeline.send(makeInjectaVoxData());

      const chainResult = audit.verifyChain();
      expect(chainResult.valid).toBe(true);
      expect(chainResult.entries).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // Consent denied
  // -------------------------------------------------------------------------

  describe('consent handling', () => {
    it('blocks message when consent is denied', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Consent not granted', { status: 403 }),
      );

      const pipeline = createPipeline();
      const result = await pipeline.send(makeInjectaVoxData());

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('CONSENT_DENIED');
      expect(MockWebSocket.instances).toHaveLength(0); // Never opened WS
    });

    it('blocks message when consent broker is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const pipeline = createPipeline();
      const result = await pipeline.send(makeInjectaVoxData());

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('CONSENT_CHECK_FAILED');
    });

    it('logs consent denied to audit trail', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Consent denied', { status: 403 }),
      );

      const pipeline = createPipeline();
      await pipeline.send(makeInjectaVoxData());

      const logPath = join(tempDir, '.careagent', 'AUDIT.log');
      const logContent = readFileSync(logPath, 'utf-8');
      const entries = logContent.trim().split('\n').map((l) => JSON.parse(l));

      const deniedEntry = entries.find((e: Record<string, unknown>) => e.action === 'message_consent_denied');
      expect(deniedEntry).toBeTruthy();
      expect(deniedEntry.outcome).toBe('denied');
    });
  });

  // -------------------------------------------------------------------------
  // Refinement
  // -------------------------------------------------------------------------

  describe('refinement pass', () => {
    it('applies refinement function before sending', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      const refine = vi.fn((msg: ClinicalMessage): ClinicalMessage => {
        if (msg.type === 'clinical_summary') {
          return { ...msg, summary: `[Refined] ${msg.summary}` };
        }
        return msg;
      });

      const pipeline = createPipeline({ refine });
      await pipeline.send(makeInjectaVoxData());

      expect(refine).toHaveBeenCalledOnce();

      const envelope = JSON.parse(MockWebSocket.instances[0].sentData[0]);
      expect(envelope.payload.summary).toContain('[Refined]');
    });

    it('returns REFINEMENT_ERROR when refinement throws', async () => {
      const refine = vi.fn((): ClinicalMessage => {
        throw new Error('Refinement engine crashed');
      });

      const pipeline = createPipeline({ refine });
      const result = await pipeline.sendMessage(
        {
          type: 'clinical_summary',
          summary: 'test',
          provider_npi: '1234567893',
          provider_name: 'Dr. Smith',
        },
        'patient-001',
      );

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('REFINEMENT_ERROR');
      expect(result.error).toContain('Refinement engine crashed');
    });

    it('returns REFINEMENT_ERROR when refined message fails schema', async () => {
      const refine = vi.fn((): ClinicalMessage => {
        // Return an invalid message (missing required fields)
        return { type: 'clinical_summary', summary: '', provider_npi: 'bad', provider_name: '' } as ClinicalMessage;
      });

      const pipeline = createPipeline({ refine });
      const result = await pipeline.sendMessage(
        {
          type: 'clinical_summary',
          summary: 'test',
          provider_npi: '1234567893',
          provider_name: 'Dr. Smith',
        },
        'patient-001',
      );

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('REFINEMENT_ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage() (pre-built message)
  // -------------------------------------------------------------------------

  describe('sendMessage()', () => {
    it('sends a pre-built clinical_summary', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      const pipeline = createPipeline();
      const result = await pipeline.sendMessage(
        {
          type: 'clinical_summary',
          summary: 'Pre-built summary',
          provider_npi: '1234567893',
          provider_name: 'Dr. Smith',
        },
        'patient-001',
      );

      expect(result.success).toBe(true);
    });

    it('sends a pre-built appointment_reminder', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      const pipeline = createPipeline();
      const result = await pipeline.sendMessage(
        {
          type: 'appointment_reminder',
          scheduled_at: '2026-03-15T09:00:00Z',
          provider_npi: '1234567893',
          provider_name: 'Dr. Smith',
        },
        'patient-001',
      );

      expect(result.success).toBe(true);
    });

    it('sends a pre-built care_plan_update', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      const pipeline = createPipeline();
      const result = await pipeline.sendMessage(
        {
          type: 'care_plan_update',
          summary: 'Updated care plan',
          provider_npi: '1234567893',
          provider_name: 'Dr. Smith',
        },
        'patient-001',
      );

      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Transport failures
  // -------------------------------------------------------------------------

  describe('transport error handling', () => {
    it('returns PATIENT_UNREACHABLE when WebSocket connection refused', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      class ErrorWebSocket {
        private listeners: Record<string, WsListener[]> = {};

        constructor(_url: string) {
          setTimeout(() => {
            const listeners = this.listeners['error'] || [];
            for (const l of listeners) l({ message: 'connect failed: ECONNREFUSED' });
          }, 2);
        }

        addEventListener(event: string, listener: WsListener): void {
          if (!this.listeners[event]) this.listeners[event] = [];
          this.listeners[event].push(listener);
        }

        send(): void {}
        close(): void {}
      }

      vi.stubGlobal('WebSocket', ErrorWebSocket);

      const pipeline = createPipeline();
      const result = await pipeline.send(makeInjectaVoxData());

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('PATIENT_UNREACHABLE');
    });

    it('logs transport failure to audit trail', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ allowed: true }),
      );

      class ErrorWebSocket {
        private listeners: Record<string, WsListener[]> = {};

        constructor(_url: string) {
          setTimeout(() => {
            const listeners = this.listeners['error'] || [];
            for (const l of listeners) l({ message: 'connect failed: ECONNREFUSED' });
          }, 2);
        }

        addEventListener(event: string, listener: WsListener): void {
          if (!this.listeners[event]) this.listeners[event] = [];
          this.listeners[event].push(listener);
        }

        send(): void {}
        close(): void {}
      }

      vi.stubGlobal('WebSocket', ErrorWebSocket);

      const pipeline = createPipeline();
      await pipeline.send(makeInjectaVoxData());

      const logPath = join(tempDir, '.careagent', 'AUDIT.log');
      const logContent = readFileSync(logPath, 'utf-8');
      const entries = logContent.trim().split('\n').map((l) => JSON.parse(l));

      const failEntry = entries.find((e: Record<string, unknown>) => e.action === 'message_send_failed');
      expect(failEntry).toBeTruthy();
      expect(failEntry.outcome).toBe('error');
    });
  });
});
