/**
 * Neuron client factory — HTTP client for provider registration and
 * heartbeat communication with a Neuron endpoint.
 *
 * The neuron acts as the relay between provider-core and the Axon
 * trust registry. Registration flow:
 *
 *   provider-core → neuron → Axon registry
 *                ← neuron ← (registration_id, DID)
 *
 * Uses native fetch() with AbortController-based timeouts.
 * Zero runtime dependencies — Node.js built-ins only.
 */

import type {
  NeuronClient,
  NeuronRegisterConfig,
  NeuronRegisterResult,
  NeuronHeartbeatResult,
} from './types.js';
import { NeuronClientError } from './types.js';

const LAYER_NAME = 'neuron-client';
const DEFAULT_TIMEOUT_MS = 10_000;

export interface NeuronClientConfig {
  /** Request timeout in milliseconds (default: 10000). */
  timeoutMs?: number;
}

/**
 * Create a Neuron client that communicates with a Neuron server over HTTP.
 *
 * @param config - Optional client configuration
 * @returns A NeuronClient instance backed by HTTP fetch
 */
export function createNeuronClient(config?: NeuronClientConfig): NeuronClient {
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let _endpoint: string | null = null;
  let _registrationId: string | null = null;

  /**
   * Internal helper — send JSON to a Neuron endpoint with timeout
   * and structured error handling.
   */
  async function sendJson<T>(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new NeuronClientError(
            `${LAYER_NAME}: request to ${url} timed out after ${timeoutMs}ms`,
            'TIMEOUT',
            { cause: err },
          );
        }
        const detail = err instanceof Error ? err.message : String(err);
        throw new NeuronClientError(
          `${LAYER_NAME}: connection to ${url} failed — ${detail}`,
          'CONNECTION_FAILED',
          { cause: err },
        );
      }

      if (!response.ok) {
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch {
          // body unreadable — proceed without it
        }

        // Map specific HTTP codes to semantic error codes
        const code = mapHttpErrorCode(response.status, responseBody);

        throw new NeuronClientError(
          `${LAYER_NAME}: ${url} returned HTTP ${response.status}${responseBody ? ` — ${responseBody}` : ''}`,
          code,
          { statusCode: response.status, cause: responseBody },
        );
      }

      try {
        return (await response.json()) as T;
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new NeuronClientError(
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
    async register(regConfig: NeuronRegisterConfig): Promise<NeuronRegisterResult> {
      const baseUrl = regConfig.neuronEndpoint.replace(/\/+$/, '');
      _endpoint = baseUrl;

      const payload = {
        provider_npi: regConfig.providerNpi,
        provider_name: regConfig.providerName,
        provider_types: regConfig.providerTypes,
        ...(regConfig.specialty ? { specialty: regConfig.specialty } : {}),
        ...(regConfig.credentials ? { credentials: regConfig.credentials } : {}),
      };

      const result = await sendJson<{
        registration_id: string;
        provider_id: string;
        status: string;
      }>(`${baseUrl}/v1/providers/register`, 'POST', payload);

      _registrationId = result.registration_id;

      return {
        registrationId: result.registration_id,
        status: result.status,
        providerDid: result.provider_id,
      };
    },

    async heartbeat(): Promise<NeuronHeartbeatResult> {
      if (!_endpoint || !_registrationId) {
        return { connected: false };
      }

      try {
        const result = await sendJson<{
          status: string;
          last_seen?: string;
        }>(`${_endpoint}/v1/providers/${_registrationId}/heartbeat`, 'GET');

        return {
          connected: result.status === 'connected' || result.status === 'reachable',
          lastSeen: result.last_seen,
        };
      } catch {
        return { connected: false };
      }
    },

    async disconnect(): Promise<void> {
      if (!_endpoint || !_registrationId) {
        return;
      }

      try {
        await sendJson<void>(
          `${_endpoint}/v1/providers/${_registrationId}/disconnect`,
          'POST',
        );
      } finally {
        _registrationId = null;
      }
    },
  };
}

/**
 * Map HTTP status codes to semantic NeuronClientErrorCode values.
 */
function mapHttpErrorCode(
  status: number,
  body: string,
): NeuronClientError['code'] {
  if (status === 409) {
    return 'NPI_ALREADY_REGISTERED';
  }
  if (status === 422 || status === 400) {
    return 'REGISTRATION_REJECTED';
  }
  if (status === 502 || status === 503 || status === 504) {
    if (body.toLowerCase().includes('axon')) {
      return 'AXON_UNREACHABLE';
    }
    return 'CONNECTION_FAILED';
  }
  return 'HTTP_ERROR';
}
