/**
 * Axon client factory — creates an AxonClient that fetches provider
 * taxonomy and questionnaire data from an Axon HTTP server.
 *
 * Uses native fetch() with AbortController-based timeouts. All failures
 * are surfaced as structured AxonClientError instances with typed codes.
 */

import type {
  AxonClient,
  AxonClientConfig,
  AxonProviderType,
  AxonQuestionnaire,
  AxonNpiLookupResult,
} from './types.js';
import { AxonClientError } from './types.js';

const LAYER_NAME = 'axon-client';
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Create an Axon client that communicates with the given Axon server.
 *
 * @param config - Axon server connection configuration
 * @returns An AxonClient instance backed by HTTP fetch
 */
export function createAxonClient(config: AxonClientConfig): AxonClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * Internal helper — fetch JSON from an Axon endpoint with timeout
   * and structured error handling.
   */
  async function fetchJson<T>(path: string): Promise<T> {
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AxonClientError(
            `${LAYER_NAME}: request to ${url} timed out after ${timeoutMs}ms`,
            'TIMEOUT',
            { cause: err },
          );
        }
        const detail = err instanceof Error ? err.message : String(err);
        throw new AxonClientError(
          `${LAYER_NAME}: connection to ${url} failed — ${detail}`,
          'CONNECTION_FAILED',
          { cause: err },
        );
      }

      if (!response.ok) {
        let body = '';
        try {
          body = await response.text();
        } catch {
          // body unreadable — proceed without it
        }
        throw new AxonClientError(
          `${LAYER_NAME}: ${url} returned HTTP ${response.status}${body ? ` — ${body}` : ''}`,
          'HTTP_ERROR',
          { statusCode: response.status, cause: body },
        );
      }

      try {
        return (await response.json()) as T;
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new AxonClientError(
          `${LAYER_NAME}: invalid JSON from ${url} — ${detail}`,
          'INVALID_RESPONSE',
          { cause: err },
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getProviderTypes(): Promise<AxonProviderType[]> {
      const result = await fetchJson<{ provider_types: AxonProviderType[] }>(
        '/v1/taxonomy/provider-types',
      );
      return result.provider_types;
    },

    async getQuestionnaire(providerTypeId: string): Promise<AxonQuestionnaire> {
      if (!providerTypeId) {
        throw new AxonClientError(
          `${LAYER_NAME}: providerTypeId must be a non-empty string`,
          'INVALID_RESPONSE',
        );
      }
      return fetchJson<AxonQuestionnaire>(
        `/v1/questionnaires/${encodeURIComponent(providerTypeId)}`,
      );
    },

    async lookupNpi(npi: string): Promise<AxonNpiLookupResult> {
      if (!npi || !/^\d{10}$/.test(npi)) {
        throw new AxonClientError(
          `${LAYER_NAME}: NPI must be exactly 10 digits`,
          'INVALID_RESPONSE',
        );
      }
      return fetchJson<AxonNpiLookupResult>(
        `/v1/npi/lookup/${encodeURIComponent(npi)}`,
      );
    },

    async checkHealth(): Promise<{ status: string; version: string }> {
      return fetchJson<{ status: string; version: string }>('/health');
    },
  };
}
