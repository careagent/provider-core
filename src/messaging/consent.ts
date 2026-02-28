/**
 * Consent verification — checks with neuron's consent broker before
 * sending any clinical message to a patient agent.
 *
 * Covers:
 * - MSG-04: Consent verification via neuron consent broker (Session 03c)
 * - No message is sent without verified consent
 *
 * The consent check queries the neuron endpoint for an active consent
 * relationship between the provider and patient. If consent is denied,
 * expired, or the broker is unreachable, the message is blocked.
 *
 * Uses native fetch() — zero runtime dependencies.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export interface ConsentCheckConfig {
  /** Neuron server base URL. */
  neuronEndpoint: string;
  /** Provider's base64url-encoded Ed25519 public key. */
  providerPublicKey: string;
  /** Request timeout in milliseconds (default: 10000). */
  timeoutMs?: number;
}

export interface ConsentCheckResult {
  allowed: boolean;
  relationship_id?: string;
  scope?: string[];
  error?: string;
  error_code?: 'CONSENT_DENIED' | 'CONSENT_EXPIRED' | 'CONSENT_CHECK_FAILED' | 'BROKER_UNREACHABLE';
}

/**
 * Verify that the provider has active consent to send a clinical message
 * to the specified patient agent.
 *
 * Queries the neuron's consent broker for an active relationship matching
 * the provider public key and patient agent ID.
 *
 * @param config - Consent check configuration
 * @param patientAgentId - The target patient agent's identifier
 * @returns Consent check result
 */
export async function verifyConsent(
  config: ConsentCheckConfig,
  patientAgentId: string,
): Promise<ConsentCheckResult> {
  const baseUrl = config.neuronEndpoint.replace(/\/+$/, '');
  const url = `${baseUrl}/v1/consent/verify`;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          provider_public_key: config.providerPublicKey,
          patient_agent_id: patientAgentId,
          action: 'send_clinical_message',
        }),
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          allowed: false,
          error: `Consent broker timed out after ${timeoutMs}ms`,
          error_code: 'BROKER_UNREACHABLE',
        };
      }
      const detail = err instanceof Error ? err.message : String(err);
      return {
        allowed: false,
        error: `Consent broker unreachable: ${detail}`,
        error_code: 'BROKER_UNREACHABLE',
      };
    }

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        // body unreadable
      }

      if (response.status === 403) {
        return {
          allowed: false,
          error: body || 'Consent denied',
          error_code: 'CONSENT_DENIED',
        };
      }

      if (response.status === 410) {
        return {
          allowed: false,
          error: body || 'Consent expired',
          error_code: 'CONSENT_EXPIRED',
        };
      }

      return {
        allowed: false,
        error: `Consent check failed: HTTP ${response.status}${body ? ` — ${body}` : ''}`,
        error_code: 'CONSENT_CHECK_FAILED',
      };
    }

    let result: { allowed: boolean; relationship_id?: string; scope?: string[] };
    try {
      result = await response.json() as typeof result;
    } catch {
      return {
        allowed: false,
        error: 'Invalid JSON from consent broker',
        error_code: 'CONSENT_CHECK_FAILED',
      };
    }

    if (!result.allowed) {
      return {
        allowed: false,
        relationship_id: result.relationship_id,
        error: 'Consent not granted for this action',
        error_code: 'CONSENT_DENIED',
      };
    }

    return {
      allowed: true,
      relationship_id: result.relationship_id,
      scope: result.scope,
    };
  } finally {
    clearTimeout(timer);
  }
}
