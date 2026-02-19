/**
 * Neuron client types — interfaces for Neuron network integration.
 *
 * The Neuron network connects provider-core instances to the broader
 * CareAgent ecosystem, enabling discovery, health monitoring, and
 * inter-agent communication.
 *
 * These are stub interfaces — implementation arrives in Phase 5.
 */

/** Registration details for connecting to a Neuron endpoint. */
export interface NeuronRegistration {
  endpoint: string;
  registrationId?: string;
  providerName: string;
  specialty: string;
}

/**
 * The Neuron client — manages connection to the Neuron network.
 *
 * Lifecycle: register() to connect, heartbeat() to check status,
 * disconnect() for clean shutdown.
 */
export interface NeuronClient {
  /** Register this provider-core instance with a Neuron endpoint. */
  register(config: NeuronRegistration): Promise<{ registrationId: string; status: string }>;

  /** Check the connection to the Neuron network. */
  heartbeat(): Promise<{ connected: boolean; lastSeen?: string }>;

  /** Cleanly disconnect from the Neuron network. */
  disconnect(): Promise<void>;
}
