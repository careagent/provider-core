/**
 * Integration tests for the Audit Pipeline subsystem.
 *
 * Verifies end-to-end behavior using temporary workspaces with real files:
 * - AUDT-01: Basic logging
 * - AUDT-02: Blocked actions
 * - AUDT-03: Action states
 * - AUDT-04: Hash chaining
 * - AUDT-05: Append-only / tamper detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { AuditPipeline } from '../../src/audit/pipeline.js';
import type { ActionStateType } from '../../src/audit/entry-schema.js';

describe('Audit Pipeline Integration', () => {
  let tmpDir: string;
  const AUDIT_LOG_PATH = '.careagent/AUDIT.log';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-audit-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Read and parse all entries from the AUDIT.log file.
   */
  function readAuditEntries(): Array<Record<string, unknown>> {
    const content = readFileSync(join(tmpDir, AUDIT_LOG_PATH), 'utf-8').trimEnd();
    if (!content) return [];
    return content.split('\n').filter(l => l.trim()).map(line => JSON.parse(line));
  }

  // ---------------------------------------------------------------------------
  // AUDT-01: Basic logging
  // ---------------------------------------------------------------------------

  describe('AUDT-01: Basic logging', () => {
    it('writes 10 entries and each is valid JSON with required fields', () => {
      const pipeline = new AuditPipeline(tmpDir);

      for (let i = 0; i < 10; i++) {
        pipeline.log({
          action: `test_action_${i}`,
          actor: 'system',
          outcome: 'allowed',
          details: { index: i },
        });
      }

      const entries = readAuditEntries();
      expect(entries.length).toBe(10);

      for (let i = 0; i < 10; i++) {
        const entry = entries[i];
        // Required fields
        expect(entry.schema_version).toBe('1');
        expect(typeof entry.timestamp).toBe('string');
        expect(typeof entry.session_id).toBe('string');
        expect(typeof entry.trace_id).toBe('string');
        expect(entry.action).toBe(`test_action_${i}`);
        expect(entry.actor).toBe('system');
        expect(entry.outcome).toBe('allowed');
        expect(entry.prev_hash).toBeDefined(); // null for first, string for rest
        expect((entry.details as Record<string, unknown>).index).toBe(i);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // AUDT-02: Blocked actions
  // ---------------------------------------------------------------------------

  describe('AUDT-02: Blocked actions', () => {
    it('logBlocked writes entry with blocked_reason, blocking_layer, and denied outcome', () => {
      const pipeline = new AuditPipeline(tmpDir);

      pipeline.logBlocked({
        action: 'prescribe_opioid',
        target: 'patient_12345',
        blocked_reason: 'Controlled substance prescriptions are prohibited',
        blocking_layer: 'scope_guard',
        details: { drug: 'hydrocodone', schedule: 'II' },
      });

      const entries = readAuditEntries();
      expect(entries.length).toBe(1);

      const entry = entries[0];
      expect(entry.outcome).toBe('denied');
      expect(entry.blocked_reason).toBe('Controlled substance prescriptions are prohibited');
      expect(entry.blocking_layer).toBe('scope_guard');
      expect(entry.action_state).toBe('system-blocked');
      expect(entry.target).toBe('patient_12345');
    });
  });

  // ---------------------------------------------------------------------------
  // AUDT-03: Action states
  // ---------------------------------------------------------------------------

  describe('AUDT-03: Action states', () => {
    it('logs entries with each of the 5 action states', () => {
      const pipeline = new AuditPipeline(tmpDir);

      const actionStates: ActionStateType[] = [
        'ai-proposed',
        'provider-approved',
        'provider-modified',
        'provider-rejected',
        'system-blocked',
      ];

      for (const state of actionStates) {
        pipeline.log({
          action: `test_${state}`,
          actor: 'system',
          outcome: 'allowed',
          action_state: state,
        });
      }

      const entries = readAuditEntries();
      expect(entries.length).toBe(5);

      for (let i = 0; i < actionStates.length; i++) {
        expect(entries[i].action_state).toBe(actionStates[i]);
        expect(entries[i].action).toBe(`test_${actionStates[i]}`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // AUDT-04: Hash chaining
  // ---------------------------------------------------------------------------

  describe('AUDT-04: Hash chaining', () => {
    it('writes 20 entries with valid hash chain', () => {
      const pipeline = new AuditPipeline(tmpDir);

      for (let i = 0; i < 20; i++) {
        pipeline.log({
          action: `chain_test_${i}`,
          actor: 'agent',
          outcome: 'allowed',
        });
      }

      // Verify via pipeline.verifyChain()
      const verification = pipeline.verifyChain();
      expect(verification.valid).toBe(true);
      expect(verification.entries).toBe(20);

      // Manual verification of chain structure
      const content = readFileSync(join(tmpDir, AUDIT_LOG_PATH), 'utf-8').trimEnd();
      const lines = content.split('\n').filter(l => l.trim());
      expect(lines.length).toBe(20);

      // First entry has prev_hash: null
      const first = JSON.parse(lines[0]);
      expect(first.prev_hash).toBeNull();

      // Each subsequent entry's prev_hash equals SHA-256 of previous entry's JSON string
      for (let i = 1; i < lines.length; i++) {
        const prevHash = createHash('sha256').update(lines[i - 1]).digest('hex');
        const current = JSON.parse(lines[i]);
        expect(current.prev_hash).toBe(prevHash);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // AUDT-05: Append-only / tamper detection
  // ---------------------------------------------------------------------------

  describe('AUDT-05: Append-only and tamper detection', () => {
    it('file grows with each entry', () => {
      const pipeline = new AuditPipeline(tmpDir);
      const logPath = join(tmpDir, AUDIT_LOG_PATH);

      pipeline.log({ action: 'first', actor: 'system', outcome: 'allowed' });
      const size1 = readFileSync(logPath, 'utf-8').length;

      pipeline.log({ action: 'second', actor: 'system', outcome: 'allowed' });
      const size2 = readFileSync(logPath, 'utf-8').length;

      pipeline.log({ action: 'third', actor: 'system', outcome: 'allowed' });
      const size3 = readFileSync(logPath, 'utf-8').length;

      expect(size2).toBeGreaterThan(size1);
      expect(size3).toBeGreaterThan(size2);
    });

    it('detects tampering in the middle of the chain', () => {
      const pipeline = new AuditPipeline(tmpDir);
      const logPath = join(tmpDir, AUDIT_LOG_PATH);

      // Write 5 entries
      for (let i = 0; i < 5; i++) {
        pipeline.log({ action: `entry_${i}`, actor: 'system', outcome: 'allowed' });
      }

      // Chain should be valid
      expect(pipeline.verifyChain().valid).toBe(true);

      // Tamper with entry 2 (index 2)
      const content = readFileSync(logPath, 'utf-8').trimEnd();
      const lines = content.split('\n');
      const tampered = JSON.parse(lines[2]);
      tampered.action = 'TAMPERED_ACTION';
      lines[2] = JSON.stringify(tampered);
      writeFileSync(logPath, lines.join('\n') + '\n');

      // Re-read with a new pipeline to verify
      const pipeline2 = new AuditPipeline(tmpDir);
      const result = pipeline2.verifyChain();

      expect(result.valid).toBe(false);
      // The break should be detected at entry 2 or 3 (depending on which hash mismatches)
      expect(result.brokenAt).toBeDefined();
      expect(typeof result.brokenAt).toBe('number');
    });
  });
});
