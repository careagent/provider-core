/**
 * Protocol server factory — stub implementation for Phase 5.
 *
 * All methods throw "not yet implemented" errors. Phase 5 will replace
 * this with the full cross-installation protocol server.
 */

import type { ProtocolServer } from './types.js';

/** Create a protocol server instance (stub — Phase 5). */
export function createProtocolServer(): ProtocolServer {
  return {
    async start(_port) {
      throw new Error('Protocol server not yet implemented (Phase 5)');
    },
    async stop() {
      throw new Error('Protocol server not yet implemented (Phase 5)');
    },
    activeSessions() {
      throw new Error('Protocol server not yet implemented (Phase 5)');
    },
  };
}
