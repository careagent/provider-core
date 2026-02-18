/**
 * careagent status command — reports activation state, CANS.md summary,
 * hardening layer status, and audit stats.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ActivationGate } from '../activation/gate.js';
import { computeHash, getIntegrityStorePath } from '../activation/cans-integrity.js';
import { AuditWriter } from '../audit/writer.js';

export interface AuditStats {
  totalEntries: number;
  chainValid: boolean;
  chainError?: string;
  lastTimestamp: string | null;
}

export function readAuditStats(workspacePath: string): AuditStats {
  const auditLogPath = join(workspacePath, '.careagent', 'AUDIT.log');

  try {
    if (!existsSync(auditLogPath)) {
      return { totalEntries: 0, chainValid: true, lastTimestamp: null };
    }

    const content = readFileSync(auditLogPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() !== '');

    if (lines.length === 0) {
      return { totalEntries: 0, chainValid: true, lastTimestamp: null };
    }

    const totalEntries = lines.length;

    // Parse last non-empty line to extract timestamp
    let lastTimestamp: string | null = null;
    const lastLine = lines[lines.length - 1];
    try {
      const parsed = JSON.parse(lastLine) as Record<string, unknown>;
      lastTimestamp = typeof parsed['timestamp'] === 'string' ? parsed['timestamp'] : null;
    } catch {
      // Ignore parse error — leave lastTimestamp as null
    }

    // Verify the chain
    const writer = new AuditWriter(auditLogPath);
    const chainResult = writer.verifyChain();

    if (!chainResult.valid) {
      return {
        totalEntries,
        chainValid: false,
        chainError: chainResult.error,
        lastTimestamp,
      };
    }

    return { totalEntries, chainValid: true, lastTimestamp };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { totalEntries: 0, chainValid: false, chainError: message, lastTimestamp: null };
  }
}

function checkIntegrity(workspacePath: string): string {
  const cansPath = join(workspacePath, 'CANS.md');
  const storePath = getIntegrityStorePath(workspacePath);

  if (!existsSync(cansPath)) return 'No CANS.md';
  if (!existsSync(storePath)) return 'No hash stored';

  try {
    const content = readFileSync(cansPath, 'utf-8');
    const currentHash = computeHash(content);
    const stored = JSON.parse(readFileSync(storePath, 'utf-8')) as Record<string, unknown>;
    return stored['hash'] === currentHash ? 'Verified' : 'MISMATCH';
  } catch {
    return 'Error reading integrity store';
  }
}

function onOff(value: boolean): string {
  return value ? 'on' : 'off';
}

export function formatStatus(workspacePath: string): string {
  const gate = new ActivationGate(workspacePath, () => { /* no-op */ });
  const result = gate.check();
  const auditStats = readAuditStats(workspacePath);
  const integrityStatus = checkIntegrity(workspacePath);

  const lines: string[] = [];

  lines.push('CareAgent Status');
  lines.push('================');
  lines.push('');
  lines.push(`Clinical Mode:    ${result.active ? 'ACTIVE' : 'INACTIVE'}`);

  if (!result.active && result.reason) {
    lines.push(`Reason:           ${result.reason}`);
  }

  if (result.active && result.document) {
    const doc = result.document;
    lines.push('');
    lines.push(`Provider:         ${doc.provider.name}`);
    lines.push(`License:          ${doc.provider.license.type} (${doc.provider.license.state}) #${doc.provider.license.number}`);
    lines.push(`Specialty:        ${doc.provider.specialty}`);

    if (doc.provider.subspecialty) {
      lines.push(`Subspecialty:     ${doc.provider.subspecialty}`);
    }

    if (doc.provider.institution) {
      lines.push(`Institution:      ${doc.provider.institution}`);
    }

    lines.push('');
    lines.push('Autonomy Tiers:');
    lines.push(`  Chart:          ${doc.autonomy.chart}`);
    lines.push(`  Order:          ${doc.autonomy.order}`);
    lines.push(`  Charge:         ${doc.autonomy.charge}`);
    lines.push(`  Perform:        ${doc.autonomy.perform}`);

    lines.push('');
    lines.push('Hardening Layers:');
    lines.push(`  Tool Policy:    ${onOff(doc.hardening.tool_policy_lockdown)}`);
    lines.push(`  Exec Approval:  ${onOff(doc.hardening.exec_approval)}`);
    lines.push(`  CANS Injection: ${onOff(doc.hardening.cans_protocol_injection)}`);
    lines.push(`  Docker Sandbox: ${onOff(doc.hardening.docker_sandbox)}`);
    lines.push(`  Safety Guard:   ${onOff(doc.hardening.safety_guard)}`);
    lines.push(`  Audit Trail:    ${onOff(doc.hardening.audit_trail)}`);
  }

  lines.push('');
  lines.push('Audit Stats:');
  lines.push(`  Total Entries:  ${auditStats.totalEntries}`);
  lines.push(`  Chain Valid:    ${auditStats.chainValid ? 'Yes' : 'NO - BROKEN'}`);
  lines.push(`  Last Entry:     ${auditStats.lastTimestamp ?? 'N/A'}`);

  lines.push('');
  lines.push('Integrity:');
  lines.push(`  CANS.md Hash:   ${integrityStatus}`);

  return lines.join('\n');
}

export function runStatusCommand(workspacePath: string): void {
  console.log(formatStatus(workspacePath));
}
