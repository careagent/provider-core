import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const CAREAGENT_DIR = '.careagent';
const INTEGRITY_FILE = 'cans-integrity.json';

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function getIntegrityStorePath(workspacePath: string): string {
  return join(workspacePath, CAREAGENT_DIR, INTEGRITY_FILE);
}

export function verifyIntegrity(
  workspacePath: string,
  content: string,
): { valid: boolean; reason?: string; isFirstLoad?: boolean } {
  const storePath = getIntegrityStorePath(workspacePath);
  const currentHash = computeHash(content);

  if (!existsSync(storePath)) {
    const storeDir = dirname(storePath);
    mkdirSync(storeDir, { recursive: true });
    writeFileSync(storePath, JSON.stringify({
      hash: currentHash,
      timestamp: new Date().toISOString(),
    }));
    return { valid: true, isFirstLoad: true };
  }

  try {
    const stored = JSON.parse(readFileSync(storePath, 'utf-8'));
    if (stored.hash === currentHash) {
      return { valid: true };
    }
    return {
      valid: false,
      reason: `SHA-256 hash mismatch — CANS.md may have been tampered with. Expected ${stored.hash.slice(0, 12)}..., got ${currentHash.slice(0, 12)}...`,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { valid: false, reason: `Integrity store corrupted: ${message}` };
  }
}

export function updateKnownGoodHash(workspacePath: string, content: string): void {
  const storePath = getIntegrityStorePath(workspacePath);
  const storeDir = dirname(storePath);
  mkdirSync(storeDir, { recursive: true });
  writeFileSync(storePath, JSON.stringify({
    hash: computeHash(content),
    timestamp: new Date().toISOString(),
  }));
}
