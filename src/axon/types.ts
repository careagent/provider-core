/**
 * Axon client types — interfaces for fetching provider taxonomy and
 * questionnaires from an Axon HTTP server at runtime.
 *
 * All response types are locally defined to avoid importing from
 * @careagent/axon. This keeps the dependency boundary clean — provider-core
 * consumes Axon data over HTTP, not as a linked module.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Configuration for creating an Axon client. */
export interface AxonClientConfig {
  /** Axon server base URL (e.g., 'http://localhost:9999'). */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 5000). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Response types (mirrors Axon server shapes)
// ---------------------------------------------------------------------------

/** A provider type from the Axon taxonomy. */
export interface AxonProviderType {
  id: string;
  display_name: string;
  category: string;
  member_roles: string[];
}

/** A condition controlling when a question is shown. */
export interface AxonQuestionCondition {
  question_id: string;
  equals: string;
}

/** A selectable option within a question. */
export interface AxonQuestionOption {
  value: string;
  label: string;
  description?: string;
}

/** An action assignment mapping an answer to granted capabilities. */
export interface AxonActionAssignment {
  answer_value: string;
  grants: string[];
}

/** Validation constraints for text questions. */
export interface AxonTextValidation {
  pattern?: string;
  min_length?: number;
  max_length?: number;
}

/** A single question within a questionnaire. */
export interface AxonQuestion {
  id: string;
  text: string;
  answer_type: 'boolean' | 'single_select' | 'text';
  required: boolean;
  options?: AxonQuestionOption[];
  show_when?: AxonQuestionCondition;
  cans_field: string;
  action_assignments?: AxonActionAssignment[];
  validation?: AxonTextValidation;
  npi_lookup?: boolean;
  /** Key into NPI lookup result to pre-fill this question's value. */
  npi_prefill?: string;
}

/** A full questionnaire for a specific provider type. */
export interface AxonQuestionnaire {
  provider_type: string;
  version: string;
  taxonomy_version: string;
  display_name: string;
  description: string;
  questions: AxonQuestion[];
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/** Structured error codes for Axon client failures. */
export type AxonClientErrorCode =
  | 'CONNECTION_FAILED'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT';

/**
 * Structured error thrown by the Axon client for all failure modes.
 *
 * - CONNECTION_FAILED — Axon server unreachable (ECONNREFUSED, DNS failure)
 * - HTTP_ERROR — Axon returned a non-2xx HTTP status
 * - INVALID_RESPONSE — Axon returned unparseable or malformed JSON
 * - TIMEOUT — Request exceeded the configured timeout
 */
export class AxonClientError extends Error {
  readonly code: AxonClientErrorCode;
  readonly statusCode?: number;
  override readonly cause?: unknown;

  constructor(
    message: string,
    code: AxonClientErrorCode,
    options?: { statusCode?: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'AxonClientError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }
}

// ---------------------------------------------------------------------------
// NPI lookup response (from Axon's NPPES proxy endpoint)
// ---------------------------------------------------------------------------

/** Structured result from an NPI lookup via Axon. */
export interface AxonNpiLookupResult {
  npi: string;
  enumeration_type: 'NPI-1' | 'NPI-2';
  status: string;
  name: string;
  first_name?: string;
  last_name?: string;
  credential?: string;
  organization_name?: string;
  specialty?: string;
  taxonomy_code?: string;
  license_state?: string;
  license_number?: string;
  practice_state?: string;
  practice_city?: string;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/**
 * The Axon client — fetches provider taxonomy, questionnaires, and NPI
 * lookups from an Axon server over HTTP.
 *
 * Lifecycle: create via `createAxonClient(config)`, then call methods
 * as needed. No persistent connection — each call is a standalone HTTP request.
 */
export interface AxonClient {
  /** Fetch the full list of provider types from the Axon taxonomy. */
  getProviderTypes(): Promise<AxonProviderType[]>;

  /** Fetch the questionnaire for a specific provider type. */
  getQuestionnaire(providerTypeId: string): Promise<AxonQuestionnaire>;

  /** Look up a provider by NPI via the NPPES registry (proxied through Axon). */
  lookupNpi(npi: string): Promise<AxonNpiLookupResult>;

  /** Health check — verify the Axon server is reachable. */
  checkHealth(): Promise<{ status: string; version: string }>;
}
