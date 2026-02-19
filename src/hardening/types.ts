/**
 * Hardening engine types — interfaces for the 6-layer hardening system.
 *
 * Covers HARD-01..07 requirements:
 * - Tool policy lockdown (HARD-01)
 * - Execution approval gates (HARD-02)
 * - CANS protocol injection into system prompt (HARD-03)
 * - Docker sandbox enforcement (HARD-04)
 * - Safety guard (HARD-05)
 * - Audit trail integration (HARD-06)
 * - before_tool_call canary (HARD-07)
 *
 * These are stub interfaces — implementation arrives in Phase 3.
 */

import type { CANSDocument } from '../activation/cans-schema.js';
import type { PlatformAdapter } from '../adapters/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';

/** Result from a single hardening layer check. */
export interface HardeningLayerResult {
  layer: string;
  allowed: boolean;
  reason?: string;
}

/** Configuration required to activate the hardening engine. */
export interface HardeningConfig {
  cans: CANSDocument;
  adapter: PlatformAdapter;
  audit: AuditPipeline;
}

/**
 * The hardening engine — enforces all 6 hardening layers on every tool call.
 *
 * Lifecycle: activate() once with CANS config, then check() on every tool call.
 * injectProtocol() extracts clinical hard rules for system prompt injection (HARD-03).
 */
export interface HardeningEngine {
  /** Initialize all 6 hardening layers from CANS configuration. */
  activate(config: HardeningConfig): void;

  /** Check a tool call against all active hardening layers. */
  check(toolName: string, params?: Record<string, unknown>): HardeningLayerResult;

  /** Extract clinical hard rules from CANS for system prompt injection (HARD-03). */
  injectProtocol(cans: CANSDocument): string[];
}
