/**
 * Integration tests for the Axon client against a live Axon mock server.
 *
 * The Axon mock server (@careagent/axon/mock) does NOT serve:
 *   - GET /v1/taxonomy/provider-types
 *   - GET /health
 *
 * Approach: We create a lightweight node:http proxy server that adds the
 * missing endpoints (provider-types via AxonTaxonomy, health with static
 * response) and forwards all other requests to the underlying mock server.
 * This tests the real AxonClient against real HTTP communication.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createMockAxonServer } from '@careagent/axon/mock';
import { AxonTaxonomy } from '@careagent/axon/taxonomy';
import { createAxonClient } from '../../src/axon/client.js';
import { AxonClientError } from '../../src/axon/types.js';
import type { AxonClient } from '../../src/axon/types.js';
import type { MockAxonServer } from '@careagent/axon/mock';

// ---------------------------------------------------------------------------
// Test server wrapper -- adds missing endpoints to the Axon mock server
// ---------------------------------------------------------------------------

interface WrappedServer {
  url: string;
  start(): Promise<string>;
  stop(): Promise<void>;
}

/**
 * Wrap the Axon mock server with a proxy that adds:
 * - GET /v1/taxonomy/provider-types (from AxonTaxonomy)
 * - GET /health (static response)
 *
 * All other requests are proxied to the underlying mock server.
 */
function createWrappedServer(mockServer: MockAxonServer): WrappedServer {
  let proxyServer: http.Server | undefined;
  let proxyUrl = '';

  return {
    get url() {
      return proxyUrl;
    },
    async start(): Promise<string> {
      // Start the underlying mock server first
      const mockUrl = await mockServer.start();

      return new Promise<string>((resolve, reject) => {
        proxyServer = http.createServer(async (req, res) => {
          const pathname = new URL(req.url ?? '/', `http://localhost`).pathname;

          // Serve provider types directly from AxonTaxonomy
          if (req.method === 'GET' && pathname === '/v1/taxonomy/provider-types') {
            const types = AxonTaxonomy.getProviderTypes();
            const body = JSON.stringify({ provider_types: types });
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            });
            res.end(body);
            return;
          }

          // Serve health endpoint
          if (req.method === 'GET' && pathname === '/health') {
            const body = JSON.stringify({ status: 'ok', version: '1.0.0' });
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            });
            res.end(body);
            return;
          }

          // Proxy everything else to the mock server
          const targetUrl = `${mockUrl}${req.url}`;
          try {
            const proxyRes = await fetch(targetUrl, {
              method: req.method,
              headers: { 'Accept': 'application/json' },
            });
            const responseBody = await proxyRes.text();
            res.writeHead(proxyRes.status, {
              'Content-Type': proxyRes.headers.get('Content-Type') ?? 'application/json',
            });
            res.end(responseBody);
          } catch {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error' }));
          }
        });

        proxyServer.on('error', reject);
        proxyServer.listen(0, () => {
          const addr = proxyServer!.address();
          if (typeof addr === 'object' && addr !== null) {
            proxyUrl = `http://localhost:${addr.port}`;
          }
          resolve(proxyUrl);
        });
      });
    },
    async stop(): Promise<void> {
      if (proxyServer) {
        await new Promise<void>((resolve, reject) => {
          proxyServer!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        proxyServer = undefined;
      }
      await mockServer.stop();
    },
  };
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Axon client integration', () => {
  let mockServer: MockAxonServer;
  let wrappedServer: WrappedServer;
  let client: AxonClient;

  beforeAll(async () => {
    mockServer = createMockAxonServer();
    wrappedServer = createWrappedServer(mockServer);
    const url = await wrappedServer.start();
    client = createAxonClient({ baseUrl: url, timeoutMs: 5000 });
  });

  afterAll(async () => {
    await wrappedServer.stop();
  });

  // -------------------------------------------------------------------------
  // AXON-01: Provider type list
  // -------------------------------------------------------------------------

  describe('AXON-01: Provider type list', () => {
    it('retrieves provider types from Axon server', async () => {
      const types = await client.getProviderTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBe(49);
    });

    it('each provider type has id, display_name, and category', async () => {
      const types = await client.getProviderTypes();
      for (const type of types.slice(0, 5)) {
        expect(type).toHaveProperty('id');
        expect(type).toHaveProperty('display_name');
        expect(type).toHaveProperty('category');
        expect(typeof type.id).toBe('string');
        expect(typeof type.display_name).toBe('string');
        expect(typeof type.category).toBe('string');
      }
    });

    it('includes physician type with MD/DO roles', async () => {
      const types = await client.getProviderTypes();
      const physician = types.find((t) => t.id === 'physician');
      expect(physician).toBeDefined();
      expect(physician!.display_name).toBe('Physician');
      expect(physician!.category).toBe('medical');
      expect(physician!.member_roles).toContain('MD');
      expect(physician!.member_roles).toContain('DO');
    });
  });

  // -------------------------------------------------------------------------
  // AXON-02: Questionnaire fetch
  // -------------------------------------------------------------------------

  describe('AXON-02: Questionnaire fetch', () => {
    it('retrieves physician questionnaire', async () => {
      const q = await client.getQuestionnaire('physician');
      expect(q.provider_type).toBe('physician');
      expect(q.questions.length).toBe(13);
    });

    it('questionnaire contains questions with expected fields', async () => {
      const q = await client.getQuestionnaire('physician');
      const first = q.questions[0]!;
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('text');
      expect(first).toHaveProperty('answer_type');
      expect(first).toHaveProperty('required');
      expect(first).toHaveProperty('cans_field');
    });

    it('returns AxonClientError for unknown provider type', async () => {
      try {
        await client.getQuestionnaire('nonexistent_type');
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
  // AXON-04: Graceful error handling
  // -------------------------------------------------------------------------

  describe('AXON-04: Graceful error handling', () => {
    it('throws CONNECTION_FAILED when server is stopped', async () => {
      // Create a client pointing to a port that is definitely not listening.
      // Use a random high port that is extremely unlikely to be in use.
      const deadClient = createAxonClient({
        baseUrl: 'http://localhost:19876',
        timeoutMs: 2000,
      });

      try {
        await deadClient.getProviderTypes();
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.code).toBe('CONNECTION_FAILED');
      }
    });

    it('includes helpful error message with server URL', async () => {
      const deadClient = createAxonClient({
        baseUrl: 'http://localhost:19876',
        timeoutMs: 2000,
      });

      try {
        await deadClient.getProviderTypes();
        expect.fail('Expected AxonClientError');
      } catch (err) {
        expect(err).toBeInstanceOf(AxonClientError);
        const axonErr = err as AxonClientError;
        expect(axonErr.message).toContain('localhost:19876');
      }
    });

    it('health check returns server status', async () => {
      const health = await client.checkHealth();
      expect(health.status).toBe('ok');
    });
  });
});
