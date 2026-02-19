/**
 * Audit integrity background service — periodically verifies the audit
 * hash chain has not been tampered with.
 *
 * Covers:
 * - AUDT-06: Background integrity verification service
 *
 * Runs an initial check on startup, then repeats every 60 seconds.
 * Any chain break is logged as an error through both the adapter logger
 * and the audit pipeline itself.
 */

import type { ServiceConfig } from '../adapters/types.js';
import type { AuditPipeline } from './pipeline.js';

interface AdapterLog {
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}

const CHECK_INTERVAL_MS = 60_000;

export function createAuditIntegrityService(
  audit: AuditPipeline,
  adapter: AdapterLog,
): ServiceConfig {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  return {
    id: 'careagent-audit-integrity',

    start: () => {
      adapter.log('info', '[CareAgent] Audit integrity service started');

      const initialResult = audit.verifyChain();
      if (!initialResult.valid) {
        adapter.log('error', `[CareAgent] Audit chain integrity failure on startup: ${initialResult.error}`);
        audit.log({
          action: 'audit_integrity_check',
          actor: 'system',
          outcome: 'error',
          details: {
            phase: 'startup',
            ...initialResult,
          },
        });
      }

      intervalId = setInterval(() => {
        const result = audit.verifyChain();
        if (!result.valid) {
          adapter.log('error', `[CareAgent] Audit chain integrity failure: ${result.error}`);
          audit.log({
            action: 'audit_integrity_check',
            actor: 'system',
            outcome: 'error',
            details: result,
          });
        }
      }, CHECK_INTERVAL_MS);
    },

    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      adapter.log('info', '[CareAgent] Audit integrity service stopped');
    },
  };
}
