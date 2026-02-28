import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNeuronClient } from '../../../src/neuron/client.js';
import { NeuronClientError } from '../../../src/neuron/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createNeuronClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an object with register, heartbeat, and disconnect methods', () => {
    const client = createNeuronClient();
    expect(typeof client.register).toBe('function');
    expect(typeof client.heartbeat).toBe('function');
    expect(typeof client.disconnect).toBe('function');
  });

  // -------------------------------------------------------------------------
  // register()
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('sends POST to /v1/providers/register and returns registration result', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          registration_id: 'reg-001',
          provider_id: 'did:careagent:1234567893',
          status: 'registered',
        }),
      );

      const client = createNeuronClient();
      const result = await client.register({
        neuronEndpoint: 'http://neuron:3000',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['physician'],
        specialty: 'Internal Medicine',
      });

      expect(result.registrationId).toBe('reg-001');
      expect(result.providerDid).toBe('did:careagent:1234567893');
      expect(result.status).toBe('registered');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://neuron:3000/v1/providers/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('sends provider credentials when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          registration_id: 'reg-002',
          provider_id: 'did:careagent:1234567893',
          status: 'registered',
        }),
      );

      const client = createNeuronClient();
      await client.register({
        neuronEndpoint: 'http://neuron:3000',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['physician'],
        credentials: [
          {
            type: 'license',
            issuer: 'State Medical Board',
            identifier: 'MD-12345',
            status: 'active',
          },
        ],
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.credentials).toHaveLength(1);
      expect(body.credentials[0].type).toBe('license');
    });

    it('strips trailing slash from neuron endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          registration_id: 'reg-003',
          provider_id: 'did:careagent:1234567893',
          status: 'registered',
        }),
      );

      const client = createNeuronClient();
      await client.register({
        neuronEndpoint: 'http://neuron:3000/',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['physician'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://neuron:3000/v1/providers/register',
        expect.any(Object),
      );
    });

    it('throws NeuronClientError with NPI_ALREADY_REGISTERED on 409', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'NPI already registered' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createNeuronClient();

      try {
        await client.register({
          neuronEndpoint: 'http://neuron:3000',
          providerNpi: '1234567893',
          providerName: 'Dr. Test',
          providerTypes: ['physician'],
        });
        expect.fail('Expected NeuronClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(NeuronClientError);
        const neuronErr = err as NeuronClientError;
        expect(neuronErr.code).toBe('NPI_ALREADY_REGISTERED');
        expect(neuronErr.statusCode).toBe(409);
      }
    });

    it('throws NeuronClientError with REGISTRATION_REJECTED on 400', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Invalid payload' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createNeuronClient();

      try {
        await client.register({
          neuronEndpoint: 'http://neuron:3000',
          providerNpi: '1234567893',
          providerName: 'Dr. Test',
          providerTypes: ['physician'],
        });
        expect.fail('Expected NeuronClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(NeuronClientError);
        expect((err as NeuronClientError).code).toBe('REGISTRATION_REJECTED');
      }
    });

    it('throws NeuronClientError with AXON_UNREACHABLE on 502 with axon in body', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Axon registry unreachable', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const client = createNeuronClient();

      try {
        await client.register({
          neuronEndpoint: 'http://neuron:3000',
          providerNpi: '1234567893',
          providerName: 'Dr. Test',
          providerTypes: ['physician'],
        });
        expect.fail('Expected NeuronClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(NeuronClientError);
        expect((err as NeuronClientError).code).toBe('AXON_UNREACHABLE');
      }
    });

    it('throws NeuronClientError with CONNECTION_FAILED when fetch rejects', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const client = createNeuronClient();

      try {
        await client.register({
          neuronEndpoint: 'http://neuron:3000',
          providerNpi: '1234567893',
          providerName: 'Dr. Test',
          providerTypes: ['physician'],
        });
        expect.fail('Expected NeuronClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(NeuronClientError);
        expect((err as NeuronClientError).code).toBe('CONNECTION_FAILED');
      }
    });

    it('throws NeuronClientError with TIMEOUT when request exceeds timeoutMs', async () => {
      mockFetch.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve(createMockResponse({ registration_id: 'late' }));
            }, 200);
            if (init?.signal) {
              init.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }
          }),
      );

      const client = createNeuronClient({ timeoutMs: 10 });

      try {
        await client.register({
          neuronEndpoint: 'http://neuron:3000',
          providerNpi: '1234567893',
          providerName: 'Dr. Test',
          providerTypes: ['physician'],
        });
        expect.fail('Expected NeuronClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(NeuronClientError);
        expect((err as NeuronClientError).code).toBe('TIMEOUT');
      }
    });
  });

  // -------------------------------------------------------------------------
  // heartbeat()
  // -------------------------------------------------------------------------

  describe('heartbeat', () => {
    it('returns connected: false when not registered', async () => {
      const client = createNeuronClient();
      const result = await client.heartbeat();
      expect(result.connected).toBe(false);
    });

    it('returns connected: true after successful registration and heartbeat', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          registration_id: 'reg-hb',
          provider_id: 'did:test',
          status: 'registered',
        }),
      );

      const client = createNeuronClient();
      await client.register({
        neuronEndpoint: 'http://neuron:3000',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['physician'],
      });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ status: 'connected', last_seen: '2026-01-01T00:00:00Z' }),
      );

      const result = await client.heartbeat();
      expect(result.connected).toBe(true);
      expect(result.lastSeen).toBe('2026-01-01T00:00:00Z');
    });

    it('returns connected: false when heartbeat fails', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          registration_id: 'reg-hb-fail',
          provider_id: 'did:test',
          status: 'registered',
        }),
      );

      const client = createNeuronClient();
      await client.register({
        neuronEndpoint: 'http://neuron:3000',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['physician'],
      });

      mockFetch.mockRejectedValueOnce(new TypeError('connection lost'));

      const result = await client.heartbeat();
      expect(result.connected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  describe('disconnect', () => {
    it('does nothing when not registered', async () => {
      const client = createNeuronClient();
      await expect(client.disconnect()).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends POST to disconnect endpoint after registration', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          registration_id: 'reg-dc',
          provider_id: 'did:test',
          status: 'registered',
        }),
      );

      const client = createNeuronClient();
      await client.register({
        neuronEndpoint: 'http://neuron:3000',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['physician'],
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({ status: 'disconnected' }));

      await client.disconnect();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const disconnectCall = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(disconnectCall[0]).toBe('http://neuron:3000/v1/providers/reg-dc/disconnect');
      expect(disconnectCall[1].method).toBe('POST');
    });

    it('heartbeat returns disconnected after disconnect()', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          registration_id: 'reg-dc2',
          provider_id: 'did:test',
          status: 'registered',
        }),
      );

      const client = createNeuronClient();
      await client.register({
        neuronEndpoint: 'http://neuron:3000',
        providerNpi: '1234567893',
        providerName: 'Dr. Test',
        providerTypes: ['physician'],
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({ status: 'disconnected' }));
      await client.disconnect();

      const result = await client.heartbeat();
      expect(result.connected).toBe(false);
    });
  });
});
