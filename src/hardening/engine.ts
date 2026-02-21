/**
 * Hardening engine orchestrator -- composes all 4 layers with short-circuit-on-deny.
 *
 * Implements HARD-05 (Safety Guard), HARD-06 (Audit Trail Integration),
 * and HARD-07 (before_tool_call canary) by wiring layers, audit logging,
 * canary lifecycle, and adapter hooks into a single integration point.
 *
 * Hardening is always on (deterministic, hardcoded in plugin) — not
 * configurable via CANS.
 */

import type { ToolCallEvent, ToolCallResult } from '../adapters/types.js';
import type { HardeningEngine, HardeningConfig, HardeningLayerResult, HardeningLayerFn } from './types.js';
import type { CANSDocument } from '../activation/cans-schema.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { checkToolPolicy } from './layers/tool-policy.js';
import { checkExecAllowlist } from './layers/exec-allowlist.js';
import { checkCansInjection } from './layers/cans-injection.js';
import { checkDockerSandbox } from './layers/docker-sandbox.js';
import { injectProtocol, extractProtocolRules } from './layers/cans-injection.js';
import { setupCanary } from './canary.js';

/** Ordered layer pipeline: evaluated in sequence, short-circuits on first deny. */
const LAYERS: HardeningLayerFn[] = [
  checkToolPolicy,
  checkExecAllowlist,
  checkCansInjection,
  checkDockerSandbox,
];

/** Create a hardening engine instance. */
export function createHardeningEngine(): HardeningEngine {
  let activated = false;
  let cans: CANSDocument;
  let audit: AuditPipeline;
  let adapter: PlatformAdapter;

  function check(event: ToolCallEvent): HardeningLayerResult {
    if (!activated) {
      throw new Error('Engine not activated');
    }

    const traceId = audit.createTraceId();
    let finalResult: HardeningLayerResult = { layer: 'engine', allowed: true };

    for (const layer of LAYERS) {
      const result = layer(event, cans);

      if (!result.allowed) {
        // Denied -- audit log with blocking info and short-circuit
        audit.log({
          action: 'hardening_check',
          target: event.toolName,
          outcome: 'denied',
          details: { layer: result.layer, reason: result.reason },
          blocking_layer: result.layer,
          blocked_reason: result.reason,
          trace_id: traceId,
        });
        return result;
      }

      // Allowed -- audit log this layer's pass
      audit.log({
        action: 'hardening_check',
        target: event.toolName,
        outcome: 'allowed',
        details: { layer: result.layer, reason: result.reason },
        trace_id: traceId,
      });

      finalResult = result;
    }

    return finalResult;
  }

  return {
    activate(config: HardeningConfig): void {
      cans = config.cans;
      adapter = config.adapter;
      audit = config.audit;
      activated = true;

      // Set up canary for hook liveness detection (HARD-07)
      const canary = setupCanary(adapter, audit);

      // Register before_tool_call handler (HARD-05)
      adapter.onBeforeToolCall((event: ToolCallEvent): ToolCallResult => {
        canary.markVerified();
        const result = check(event);
        if (!result.allowed) {
          return { block: true, blockReason: result.reason };
        }
        return { block: false };
      });

      // Register bootstrap handler for CANS protocol injection (HARD-03)
      // Always on — hardening is deterministic
      adapter.onAgentBootstrap((context) => {
        injectProtocol(context, cans);
      });
    },

    check,

    injectProtocol(doc: CANSDocument): string[] {
      return extractProtocolRules(doc).split('\n');
    },
  };
}
