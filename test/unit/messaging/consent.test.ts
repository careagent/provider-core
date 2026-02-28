import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyConsent } from '../../../src/messaging/consent.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
}

const DEFAULT_CONFIG = {
  neuronEndpoint: 'http://neuron:3000',
  providerPublicKey: 'test-public-key',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyConsent', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns allowed: true when consent is active', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        allowed: true,
        relationship_id: 'rel-001',
        scope: ['send_clinical_message'],
      }),
    );

    const result = await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(result.allowed).toBe(true);
    expect(result.relationship_id).toBe('rel-001');
    expect(result.scope).toEqual(['send_clinical_message']);
  });

  it('sends correct POST payload to /v1/consent/verify', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ allowed: true }),
    );

    await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://neuron:3000/v1/consent/verify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );

    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.provider_public_key).toBe('test-public-key');
    expect(body.patient_agent_id).toBe('patient-001');
    expect(body.action).toBe('send_clinical_message');
  });

  it('strips trailing slash from endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ allowed: true }),
    );

    await verifyConsent(
      { ...DEFAULT_CONFIG, neuronEndpoint: 'http://neuron:3000/' },
      'patient-001',
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'http://neuron:3000/v1/consent/verify',
      expect.any(Object),
    );
  });

  it('returns CONSENT_DENIED on 403', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Consent not granted', { status: 403 }),
    );

    const result = await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(result.allowed).toBe(false);
    expect(result.error_code).toBe('CONSENT_DENIED');
  });

  it('returns CONSENT_EXPIRED on 410', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Consent expired', { status: 410 }),
    );

    const result = await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(result.allowed).toBe(false);
    expect(result.error_code).toBe('CONSENT_EXPIRED');
  });

  it('returns CONSENT_CHECK_FAILED on other HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const result = await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(result.allowed).toBe(false);
    expect(result.error_code).toBe('CONSENT_CHECK_FAILED');
    expect(result.error).toContain('HTTP 500');
  });

  it('returns CONSENT_DENIED when broker says allowed: false', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ allowed: false, relationship_id: 'rel-002' }),
    );

    const result = await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(result.allowed).toBe(false);
    expect(result.error_code).toBe('CONSENT_DENIED');
    expect(result.relationship_id).toBe('rel-002');
  });

  it('returns BROKER_UNREACHABLE when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const result = await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(result.allowed).toBe(false);
    expect(result.error_code).toBe('BROKER_UNREACHABLE');
    expect(result.error).toContain('fetch failed');
  });

  it('returns BROKER_UNREACHABLE on timeout', async () => {
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(createMockResponse({ allowed: true }));
          }, 200);
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        }),
    );

    const result = await verifyConsent(
      { ...DEFAULT_CONFIG, timeoutMs: 10 },
      'patient-001',
    );

    expect(result.allowed).toBe(false);
    expect(result.error_code).toBe('BROKER_UNREACHABLE');
    expect(result.error).toContain('timed out');
  });

  it('returns CONSENT_CHECK_FAILED on invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const result = await verifyConsent(DEFAULT_CONFIG, 'patient-001');

    expect(result.allowed).toBe(false);
    expect(result.error_code).toBe('CONSENT_CHECK_FAILED');
    expect(result.error).toContain('Invalid JSON');
  });
});
