/**
 * AuditPipeline — high-level audit logging API with session and trace management.
 *
 * Provides:
 * - Automatic session ID management (one per plugin lifecycle)
 * - Trace ID generation for correlated event groups
 * - Convenience methods for common audit patterns (logBlocked)
 * - Chain verification pass-through
 *
 * All entries are written to `.careagent/AUDIT.log` via AuditWriter.
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { AuditWriter } from './writer.js';
import type { AuditEntry, ActionStateType } from './entry-schema.js';

const AUDIT_DIR = '.careagent';
const AUDIT_FILE = 'AUDIT.log';

export interface AuditLogInput {
  action: string;
  actor?: 'agent' | 'provider' | 'system';
  target?: string;
  outcome: 'allowed' | 'denied' | 'escalated' | 'error' | 'active' | 'inactive';
  action_state?: ActionStateType;
  details?: Record<string, unknown>;
  blocked_reason?: string;
  blocking_layer?: string;
  trace_id?: string;
}

export class AuditPipeline {
  private writer: AuditWriter;
  private sessionId: string;

  constructor(workspacePath: string, sessionId?: string) {
    const auditDir = join(workspacePath, AUDIT_DIR);
    mkdirSync(auditDir, { recursive: true });
    const logPath = join(auditDir, AUDIT_FILE);
    this.writer = new AuditWriter(logPath);
    this.sessionId = sessionId || randomUUID();
  }

  /**
   * Log an audit entry with automatic session ID, timestamp, and schema version.
   * Optional fields are only included if provided (no undefined values in JSON).
   */
  log(input: AuditLogInput): void {
    const entry: Omit<AuditEntry, 'prev_hash'> = {
      schema_version: '1',
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      trace_id: input.trace_id || randomUUID(),
      action: input.action,
      actor: input.actor || 'system',
      outcome: input.outcome,
      ...(input.target !== undefined && { target: input.target }),
      ...(input.action_state !== undefined && { action_state: input.action_state }),
      ...(input.details !== undefined && { details: input.details }),
      ...(input.blocked_reason !== undefined && { blocked_reason: input.blocked_reason }),
      ...(input.blocking_layer !== undefined && { blocking_layer: input.blocking_layer }),
    };

    this.writer.append(entry);
  }

  /**
   * Convenience method for logging blocked actions.
   * Sets actor to 'system', outcome to 'denied', and action_state to 'system-blocked'
   * by default.
   */
  logBlocked(input: {
    action: string;
    target?: string;
    blocked_reason: string;
    blocking_layer: string;
    action_state?: ActionStateType;
    details?: Record<string, unknown>;
  }): void {
    this.log({
      action: input.action,
      actor: 'system',
      target: input.target,
      outcome: 'denied',
      action_state: input.action_state || 'system-blocked',
      blocked_reason: input.blocked_reason,
      blocking_layer: input.blocking_layer,
      details: input.details,
    });
  }

  /**
   * Verify the integrity of the audit hash chain.
   */
  verifyChain(): { valid: boolean; entries: number; brokenAt?: number; error?: string } {
    return this.writer.verifyChain();
  }

  /**
   * Get the current session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Create a new trace ID for correlating related audit events.
   */
  createTraceId(): string {
    return randomUUID();
  }
}
