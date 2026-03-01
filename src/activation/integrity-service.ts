/**
 * CANS.md integrity background service — periodically verifies the
 * clinical CANS.md has not been tampered with during a session.
 *
 * Mirrors the audit integrity service pattern (src/audit/integrity-service.ts).
 *
 * Closes the gap: CANS.md is currently only verified at boot
 * (ActivationGate.check()). A bad actor modifying CANS.md mid-session
 * would go undetected until next restart. This service catches
 * tampering within 60 seconds.
 *
 * Reuses: src/activation/cans-integrity.ts — verifyIntegrity(), computeHash()
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ServiceConfig } from '../adapters/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import { verifyIntegrity } from './cans-integrity.js';

interface AdapterLog {
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}

const CHECK_INTERVAL_MS = 60_000;

export function createCansIntegrityService(
  workspacePath: string,
  audit: AuditPipeline,
  adapter: AdapterLog,
): ServiceConfig {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function runCheck(phase: string): void {
    const cansPath = join(workspacePath, 'CANS.md');

    if (!existsSync(cansPath)) {
      adapter.log('error', '[CareAgent] CANS.md missing from clinical workspace');
      audit.log({
        action: 'cans_integrity_check',
        actor: 'system',
        outcome: 'error',
        details: { phase, reason: 'CANS.md not found' },
      });
      return;
    }

    const content = readFileSync(cansPath, 'utf-8');
    const result = verifyIntegrity(workspacePath, content);

    if (!result.valid) {
      adapter.log('error', `[CareAgent] CANS.md integrity failure: ${result.reason}`);
      audit.log({
        action: 'cans_integrity_check',
        actor: 'system',
        outcome: 'error',
        details: { phase, reason: result.reason },
      });
    }
  }

  return {
    id: 'careagent-cans-integrity',

    start: () => {
      adapter.log('info', '[CareAgent] CANS.md integrity service started');

      // Initial check
      runCheck('startup');

      // Periodic check (60s interval)
      intervalId = setInterval(() => {
        runCheck('periodic');
      }, CHECK_INTERVAL_MS);
    },

    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      adapter.log('info', '[CareAgent] CANS.md integrity service stopped');
    },
  };
}
