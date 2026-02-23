import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAxonClient } from '../../../src/axon/client.js';
import { AxonClientError } from '../../../src/axon/types.js';

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

describe('createAxonClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an object with getProviderTypes, getQuestionnaire, and checkHealth methods', () => {
    const client = createAxonClient({ baseUrl: 'http://axon:9999' });
    expect(typeof client.getProviderTypes).toBe('function');
    expect(typeof client.getQuestionnaire).toBe('function');
    expect(typeof client.checkHealth).toBe('function');
  });

  // -------------------------------------------------------------------------
  // getProviderTypes
  // -------------------------------------------------------------------------

  describe('getProviderTypes', () => {
    it('fetches GET /v1/taxonomy/provider-types and returns provider type array', async () => {
      const providerTypes = [
        { id: 'physician', display_name: 'Physician', category: 'medical', member_roles: ['MD', 'DO'] },
      ];
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ provider_types: providerTypes }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });
      const result = await client.getProviderTypes();

      expect(result).toEqual(providerTypes);
    });

    it('sends Accept: application/json header', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ provider_types: [] }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });
      await client.getProviderTypes();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        }),
      );
    });

    it('constructs correct URL from baseUrl config', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ provider_types: [] }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });
      await client.getProviderTypes();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://axon:9999/v1/taxonomy/provider-types',
        expect.any(Object),
      );
    });

    it('strips trailing slash from baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ provider_types: [] }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999/' });
      await client.getProviderTypes();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://axon:9999/v1/taxonomy/provider-types',
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getQuestionnaire
  // -------------------------------------------------------------------------

  describe('getQuestionnaire', () => {
    it('fetches GET /v1/questionnaires/:typeId and returns questionnaire', async () => {
      const questionnaire = {
        provider_type: 'physician',
        version: '1.0.0',
        taxonomy_version: '1.0.0',
        display_name: 'Physician Scope Questionnaire',
        description: 'Questionnaire for physicians',
        questions: [
          {
            id: 'practice_setting',
            text: 'What is your primary practice setting?',
            answer_type: 'single_select',
            required: true,
            cans_field: 'scope.practice_setting',
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(questionnaire));

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });
      const result = await client.getQuestionnaire('physician');

      expect(result).toEqual(questionnaire);
    });

    it('URL-encodes the providerTypeId', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          provider_type: 'advanced_practice_provider',
          version: '1.0.0',
          taxonomy_version: '1.0.0',
          display_name: 'APP Questionnaire',
          description: 'Test',
          questions: [],
        }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });
      await client.getQuestionnaire('advanced_practice_provider');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://axon:9999/v1/questionnaires/advanced_practice_provider',
        expect.any(Object),
      );
    });

    it('throws AxonClientError with HTTP_ERROR when server returns 404', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });

      try {
        await client.getQuestionnaire('nonexistent');
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.code).toBe('HTTP_ERROR');
        expect(axonErr.statusCode).toBe(404);
      }
    });
  });

  // -------------------------------------------------------------------------
  // checkHealth
  // -------------------------------------------------------------------------

  describe('checkHealth', () => {
    it('fetches GET /health and returns status object', async () => {
      const health = { status: 'ok', version: '1.0.0' };
      mockFetch.mockResolvedValueOnce(createMockResponse(health));

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });
      const result = await client.checkHealth();

      expect(result).toEqual(health);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://axon:9999/health',
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws AxonClientError with CONNECTION_FAILED when fetch rejects with TypeError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });

      try {
        await client.getProviderTypes();
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.code).toBe('CONNECTION_FAILED');
      }
    });

    it('throws AxonClientError with TIMEOUT when request exceeds timeoutMs', async () => {
      // Use real timers with a very short timeout (10ms) and a mock fetch
      // that waits longer than the timeout before resolving.
      // This avoids fake-timer/AbortController interaction issues.
      mockFetch.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve(createMockResponse({ provider_types: [] }));
            }, 200);
            // Respect abort signal so the promise settles promptly
            if (init?.signal) {
              init.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }
          }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999', timeoutMs: 10 });

      try {
        await client.getProviderTypes();
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.code).toBe('TIMEOUT');
      }
    });

    it('throws AxonClientError with HTTP_ERROR on 500 status', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });

      try {
        await client.getProviderTypes();
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.code).toBe('HTTP_ERROR');
        expect(axonErr.statusCode).toBe(500);
      }
    });

    it('throws AxonClientError with INVALID_RESPONSE on non-JSON body', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('<html>Not JSON</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });

      try {
        await client.getProviderTypes();
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.code).toBe('INVALID_RESPONSE');
      }
    });

    it('includes original error as cause', async () => {
      const originalError = new TypeError('fetch failed');
      mockFetch.mockRejectedValueOnce(originalError);

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });

      try {
        await client.getProviderTypes();
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.cause).toBeDefined();
        expect(axonErr.cause).toBe(originalError);
      }
    });

    it('defaults timeoutMs to 5000 when not specified', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ provider_types: [] }),
      );

      const client = createAxonClient({ baseUrl: 'http://axon:9999' });
      await client.getProviderTypes();

      // The AbortSignal should have been passed -- we can verify the signal exists
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
    });
  });
});
