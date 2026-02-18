/**
 * AuditWriter — hash-chained, append-only JSONL writer.
 *
 * Covers:
 * - AUDT-03: Append-only JSONL audit log
 * - AUDT-04: SHA-256 hash chaining from genesis entry
 * - AUDT-05: Chain verification detects tampering
 *
 * Uses ONLY Node.js built-ins (node:fs, node:crypto). Zero dependencies.
 * Each entry's prev_hash points to the SHA-256 of the preceding JSON line,
 * forming an immutable chain where any modification is detectable.
 */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { AuditEntry } from './entry-schema.js';

export class AuditWriter {
  private lastHash: string | null = null;
  private readonly logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
    this.lastHash = this.recoverLastHash();
  }

  /**
   * Append an audit entry to the log, enriching it with the hash chain.
   * The entry is serialized to JSON and appended as a single line.
   */
  append(entry: Omit<AuditEntry, 'prev_hash'>): void {
    const enriched: AuditEntry = {
      ...entry,
      prev_hash: this.lastHash,
    };

    const line = JSON.stringify(enriched);
    const currentHash = createHash('sha256').update(line).digest('hex');

    appendFileSync(this.logPath, line + '\n', { flag: 'a' });

    this.lastHash = currentHash;
  }

  /**
   * Verify the integrity of the hash chain in the audit log.
   * Returns valid: true if the chain is intact, or details about where it broke.
   */
  verifyChain(): { valid: boolean; entries: number; brokenAt?: number; error?: string } {
    if (!existsSync(this.logPath)) {
      return { valid: true, entries: 0 };
    }

    try {
      const content = readFileSync(this.logPath, 'utf-8').trimEnd();
      if (!content) return { valid: true, entries: 0 };

      const lines = content.split('\n');
      let expectedPrevHash: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        let parsed: AuditEntry;
        try {
          parsed = JSON.parse(lines[i]);
        } catch {
          return {
            valid: false,
            entries: i,
            brokenAt: i,
            error: `Malformed JSON at line ${i + 1}`,
          };
        }

        if (parsed.prev_hash !== expectedPrevHash) {
          return {
            valid: false,
            entries: i,
            brokenAt: i,
            error: `Chain broken at entry ${i}: expected prev_hash ${expectedPrevHash}, got ${parsed.prev_hash}`,
          };
        }

        expectedPrevHash = createHash('sha256').update(lines[i]).digest('hex');
      }

      return { valid: true, entries: lines.filter(l => l.trim()).length };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { valid: false, entries: 0, error: `Chain verification error: ${message}` };
    }
  }

  /**
   * Get the hash of the last entry in the chain (or null if empty).
   */
  getLastHash(): string | null {
    return this.lastHash;
  }

  /**
   * Recover the last hash from an existing log file.
   * Called during construction to resume the chain after restart.
   */
  private recoverLastHash(): string | null {
    try {
      if (!existsSync(this.logPath)) return null;

      const content = readFileSync(this.logPath, 'utf-8').trimEnd();
      if (!content) return null;

      const lines = content.split('\n').filter(l => l.trim());
      const lastLine = lines[lines.length - 1];
      if (!lastLine) return null;

      return createHash('sha256').update(lastLine).digest('hex');
    } catch {
      return null;
    }
  }
}
