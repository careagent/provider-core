import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { CANSSchema, type CANSDocument } from './cans-schema.js';
import { parseFrontmatter } from './cans-parser.js';
import { verifyIntegrity } from './cans-integrity.js';

export interface ActivationResult {
  active: boolean;
  document: CANSDocument | null;
  reason?: string;
  errors?: Array<{ path: string; message: string }>;
}

export type AuditCallback = (entry: Record<string, unknown>) => void;

export class ActivationGate {
  private workspacePath: string;
  private auditLog: AuditCallback;

  constructor(workspacePath: string, auditLog: AuditCallback) {
    this.workspacePath = workspacePath;
    this.auditLog = auditLog;
  }

  check(): ActivationResult {
    const cansPath = join(this.workspacePath, 'CANS.md');

    // Step 1: Presence
    if (!existsSync(cansPath)) {
      return { active: false, document: null, reason: 'CANS.md not found in workspace' };
    }

    // Step 2: Parse
    const raw = readFileSync(cansPath, 'utf-8');
    const { frontmatter, error: parseError } = parseFrontmatter(raw);

    if (!frontmatter) {
      this.auditLog({
        action: 'cans_parse_error',
        actor: 'system',
        outcome: 'error',
        details: { reason: parseError || 'Failed to parse CANS.md frontmatter' },
      });
      return {
        active: false,
        document: null,
        reason: parseError || 'Failed to parse CANS.md frontmatter',
      };
    }

    // Step 3: Validate against TypeBox schema
    if (!Value.Check(CANSSchema, frontmatter)) {
      const errors = [...Value.Errors(CANSSchema, frontmatter)]
        .map(e => ({ path: e.path, message: e.message }));
      const formatted = errors.map(e => `  ${e.path}: ${e.message}`).join('\n');

      this.auditLog({
        action: 'cans_validation_error',
        actor: 'system',
        outcome: 'error',
        details: { errors },
      });

      return {
        active: false,
        document: null,
        reason: `CANS.md validation failed:\n${formatted}`,
        errors,
      };
    }

    // Step 4: Integrity check
    const integrity = verifyIntegrity(this.workspacePath, raw);
    if (!integrity.valid) {
      this.auditLog({
        action: 'cans_integrity_failure',
        actor: 'system',
        outcome: 'error',
        details: { reason: integrity.reason },
      });
      return {
        active: false,
        document: null,
        reason: integrity.reason || 'CANS.md integrity check failed',
      };
    }

    // All checks passed
    const document = frontmatter as unknown as CANSDocument;
    return { active: true, document };
  }
}
