/**
 * OpenClaw config manager — direct filesystem manipulation of openclaw.json.
 *
 * Replaces unreliable `openclaw agents add/bind/unbind` CLI calls that fail
 * when run from inside the running gateway process (lock contention,
 * "Non-interactive session" errors, in-memory state overwrites).
 *
 * All mutations read → modify → write with a .bak backup.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenClawAgent {
  id: string;
  workspace?: string;
  model?: string;
  [key: string]: unknown;
}

export interface PeerBinding {
  agentId: string;
  match: {
    channel: string;
    peer: {
      kind: string;
      id: string;
    };
  };
}

export interface OpenClawConfig {
  agents?: {
    list?: OpenClawAgent[];
    defaults?: Record<string, unknown>;
    [key: string]: unknown;
  };
  bindings?: PeerBinding[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config path resolution
// ---------------------------------------------------------------------------

export function getConfigPath(): string {
  return join(homedir(), '.openclaw', 'openclaw.json');
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export function readOpenClawConfig(configPath: string): OpenClawConfig {
  if (!existsSync(configPath)) {
    return {};
  }
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as OpenClawConfig;
}

export function writeOpenClawConfig(configPath: string, config: OpenClawConfig): void {
  // Create parent dir if needed
  const dir = configPath.replace(/[/\\][^/\\]+$/, '');
  mkdirSync(dir, { recursive: true });

  // Backup existing config
  if (existsSync(configPath)) {
    copyFileSync(configPath, configPath + '.bak');
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Agent management
// ---------------------------------------------------------------------------

export function ensureAgentInConfig(
  configPath: string,
  agentId: string,
  workspace: string,
  model?: string,
): boolean {
  const config = readOpenClawConfig(configPath);

  if (!config.agents) {
    config.agents = {};
  }
  if (!config.agents.list) {
    config.agents.list = [];
  }

  const exists = config.agents.list.some(
    (a) => a.id === agentId || a.name === agentId,
  );

  if (exists) return false; // no-op

  const agent: OpenClawAgent = { id: agentId, workspace };
  if (model) agent.model = model;
  config.agents.list.push(agent);

  writeOpenClawConfig(configPath, config);
  return true; // added
}

// ---------------------------------------------------------------------------
// Peer-level binding management
// ---------------------------------------------------------------------------

export function addPeerBinding(
  configPath: string,
  agentId: string,
  channel: string,
  peerId: string,
): boolean {
  const config = readOpenClawConfig(configPath);

  if (!config.bindings) {
    config.bindings = [];
  }

  // Idempotent: check if this exact binding already exists
  const exists = config.bindings.some(
    (b) =>
      b.agentId === agentId &&
      b.match?.channel === channel &&
      b.match?.peer?.id === peerId,
  );

  if (exists) return false; // already bound

  config.bindings.push({
    agentId,
    match: {
      channel,
      peer: {
        kind: 'direct',
        id: peerId,
      },
    },
  });

  writeOpenClawConfig(configPath, config);
  return true; // added
}

export function removePeerBinding(
  configPath: string,
  agentId: string,
  peerId: string,
): boolean {
  const config = readOpenClawConfig(configPath);

  if (!config.bindings || config.bindings.length === 0) return false;

  const before = config.bindings.length;
  config.bindings = config.bindings.filter(
    (b) => !(b.agentId === agentId && b.match?.peer?.id === peerId),
  );

  if (config.bindings.length === before) return false; // nothing removed

  writeOpenClawConfig(configPath, config);
  return true; // removed
}

// ---------------------------------------------------------------------------
// Session clearing
// ---------------------------------------------------------------------------

export function clearAgentSessions(agentId: string): void {
  const sessionsDir = join(homedir(), '.openclaw', 'agents', agentId, 'sessions');
  if (!existsSync(sessionsDir)) return;

  // Delete .jsonl transcript files
  for (const file of readdirSync(sessionsDir)) {
    if (file.endsWith('.jsonl')) {
      unlinkSync(join(sessionsDir, file));
    }
  }

  // Reset sessions index
  writeFileSync(join(sessionsDir, 'sessions.json'), '{}', 'utf-8');
}
