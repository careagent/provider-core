/**
 * Hook liveness canary (HARD-07)
 *
 * Tracks whether the before_tool_call hook actually fires. If the hook
 * is not wired by the host platform, the canary warns the provider
 * after a 30-second timeout that the Safety Guard layer is degraded.
 *
 * The timer is unref'd so it does not keep the Node.js event loop alive.
 */

import type { PlatformAdapter } from '../adapters/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';

const CANARY_TIMEOUT_MS = 30_000;

export interface CanaryHandle {
  isVerified: () => boolean;
  markVerified: () => void;
}

export function setupCanary(
  adapter: PlatformAdapter,
  audit: AuditPipeline,
): CanaryHandle {
  let verified = false;

  const timeoutId = setTimeout(() => {
    if (!verified) {
      adapter.log('warn', '[CareAgent] before_tool_call hook did NOT fire. Safety Guard is degraded.');
      audit.log({
        action: 'hook_canary',
        actor: 'system',
        outcome: 'error',
        details: {
          hook: 'before_tool_call',
          status: 'not_fired',
          message: 'Safety Guard Layer 5 is degraded -- hook not wired by host platform',
        },
      });
    }
  }, CANARY_TIMEOUT_MS);

  if (timeoutId && typeof timeoutId === 'object' && 'unref' in timeoutId) {
    (timeoutId as NodeJS.Timeout).unref();
  }

  return {
    isVerified: () => verified,
    markVerified: () => {
      if (!verified) {
        verified = true;
        audit.log({
          action: 'hook_canary',
          actor: 'system',
          outcome: 'allowed',
          details: { hook: 'before_tool_call', status: 'verified' },
        });
      }
    },
  };
}
