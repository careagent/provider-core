/**
 * Protocol server types — interfaces for the cross-installation protocol.
 *
 * The protocol server handles inbound communication from other CareAgent
 * installations, managing sessions between patient agents and provider agents.
 *
 * These are stub interfaces — implementation arrives in Phase 5.
 */

/** An active protocol session between two agents. */
export interface ProtocolSession {
  sessionId: string;
  patientAgentId: string;
  providerAgentId: string;
  startedAt: string;
  status: 'active' | 'completed' | 'terminated';
}

/**
 * The protocol server — manages inbound cross-installation communication.
 *
 * Lifecycle: start() to begin listening, activeSessions() to inspect,
 * stop() for graceful shutdown.
 */
export interface ProtocolServer {
  /** Start the inbound channel endpoint on the given port. */
  start(port: number): Promise<void>;

  /** Gracefully shut down the protocol server. */
  stop(): Promise<void>;

  /** List all currently active protocol sessions. */
  activeSessions(): ProtocolSession[];
}
