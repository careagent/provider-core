/**
 * Neuron client types — interfaces for Neuron network integration.
 *
 * The Neuron network connects provider-core instances to the broader
 * CareAgent ecosystem, enabling discovery, health monitoring, and
 * inter-agent communication.
 *
 * The neuron relays provider registration to the Axon trust registry
 * and maintains heartbeat connectivity.
 */

/** Registration details for connecting to a Neuron endpoint. */
export interface NeuronRegistration {
  endpoint: string;
  registrationId?: string;
  providerName: string;
  specialty: string;
}

/** Configuration for registering a provider through the neuron. */
export interface NeuronRegisterConfig {
  /** Neuron server base URL. */
  neuronEndpoint: string;
  /** 10-digit NPI. */
  providerNpi: string;
  /** Provider display name. */
  providerName: string;
  /** Provider type IDs from taxonomy. */
  providerTypes: string[];
  /** Optional specialty. */
  specialty?: string;
  /** Provider credentials for Axon registration. */
  credentials?: NeuronCredential[];
}

/** A credential submitted during registration. */
export interface NeuronCredential {
  type: 'license' | 'certification' | 'privilege';
  issuer: string;
  identifier: string;
  status: 'active' | 'pending' | 'expired' | 'suspended' | 'revoked';
  issued_at?: string;
  expires_at?: string;
}

/** Result of a successful neuron registration. */
export interface NeuronRegisterResult {
  registrationId: string;
  status: string;
  providerDid?: string;
}

/** Result of a neuron heartbeat check. */
export interface NeuronHeartbeatResult {
  connected: boolean;
  lastSeen?: string;
}

/** Structured error codes for neuron client failures. */
export type NeuronClientErrorCode =
  | 'CONNECTION_FAILED'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'NPI_ALREADY_REGISTERED'
  | 'REGISTRATION_REJECTED'
  | 'AXON_UNREACHABLE';

/**
 * Structured error thrown by the Neuron client for all failure modes.
 */
export class NeuronClientError extends Error {
  readonly code: NeuronClientErrorCode;
  readonly statusCode?: number;
  override readonly cause?: unknown;

  constructor(
    message: string,
    code: NeuronClientErrorCode,
    options?: { statusCode?: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'NeuronClientError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }
}

/**
 * The Neuron client — manages connection to the Neuron network.
 *
 * Lifecycle: register() to connect, heartbeat() to check status,
 * disconnect() for clean shutdown.
 */
export interface NeuronClient {
  /** Register this provider with the neuron → Axon pipeline. */
  register(config: NeuronRegisterConfig): Promise<NeuronRegisterResult>;

  /** Check the connection to the Neuron network. */
  heartbeat(): Promise<NeuronHeartbeatResult>;

  /** Cleanly disconnect from the Neuron network. */
  disconnect(): Promise<void>;
}
