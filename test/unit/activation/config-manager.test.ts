/**
 * Tests for the OpenClaw config manager — direct filesystem manipulation
 * of openclaw.json for agent and binding management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readOpenClawConfig,
  writeOpenClawConfig,
  ensureAgentInConfig,
  addPeerBinding,
  removePeerBinding,
  clearAgentSessions,
} from '../../../src/activation/config-manager.js';

describe('config-manager', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'config-mgr-'));
    configPath = join(tmpDir, 'openclaw.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // readOpenClawConfig
  // -------------------------------------------------------------------------

  describe('readOpenClawConfig', () => {
    it('returns empty object when config does not exist', () => {
      const config = readOpenClawConfig(configPath);
      expect(config).toEqual({});
    });

    it('reads and parses existing config', () => {
      writeFileSync(configPath, JSON.stringify({ agents: { list: [] } }), 'utf-8');
      const config = readOpenClawConfig(configPath);
      expect(config.agents).toEqual({ list: [] });
    });
  });

  // -------------------------------------------------------------------------
  // writeOpenClawConfig
  // -------------------------------------------------------------------------

  describe('writeOpenClawConfig', () => {
    it('writes config as formatted JSON', () => {
      writeOpenClawConfig(configPath, { agents: { list: [] } });
      const raw = readFileSync(configPath, 'utf-8');
      expect(raw).toContain('"agents"');
      expect(raw.endsWith('\n')).toBe(true);
    });

    it('creates parent directory if needed', () => {
      const nestedPath = join(tmpDir, 'nested', 'dir', 'openclaw.json');
      writeOpenClawConfig(nestedPath, { test: true });
      expect(existsSync(nestedPath)).toBe(true);
    });

    it('creates .bak backup of existing config', () => {
      writeFileSync(configPath, '{"original": true}', 'utf-8');
      writeOpenClawConfig(configPath, { updated: true });
      const backup = readFileSync(configPath + '.bak', 'utf-8');
      expect(JSON.parse(backup)).toEqual({ original: true });
    });
  });

  // -------------------------------------------------------------------------
  // ensureAgentInConfig
  // -------------------------------------------------------------------------

  describe('ensureAgentInConfig', () => {
    it('adds agent to empty config', () => {
      const added = ensureAgentInConfig(configPath, 'careagent-provider', '/workspace');
      expect(added).toBe(true);

      const config = readOpenClawConfig(configPath);
      expect(config.agents?.list).toHaveLength(1);
      expect(config.agents?.list?.[0]).toEqual({ id: 'careagent-provider', workspace: '/workspace' });
    });

    it('is a no-op when agent already exists', () => {
      ensureAgentInConfig(configPath, 'careagent-provider', '/workspace');
      const added = ensureAgentInConfig(configPath, 'careagent-provider', '/workspace');
      expect(added).toBe(false);

      const config = readOpenClawConfig(configPath);
      expect(config.agents?.list).toHaveLength(1);
    });

    it('includes model when provided', () => {
      ensureAgentInConfig(configPath, 'careagent-provider', '/workspace', 'claude-3-opus');
      const config = readOpenClawConfig(configPath);
      expect(config.agents?.list?.[0]?.model).toBe('claude-3-opus');
    });

    it('preserves existing agents', () => {
      writeOpenClawConfig(configPath, {
        agents: { list: [{ id: 'main', workspace: '/main' }] },
      });
      ensureAgentInConfig(configPath, 'careagent-provider', '/clinical');
      const config = readOpenClawConfig(configPath);
      expect(config.agents?.list).toHaveLength(2);
      expect(config.agents?.list?.[0]?.id).toBe('main');
      expect(config.agents?.list?.[1]?.id).toBe('careagent-provider');
    });
  });

  // -------------------------------------------------------------------------
  // addPeerBinding
  // -------------------------------------------------------------------------

  describe('addPeerBinding', () => {
    it('adds a peer-level binding to empty config', () => {
      const added = addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user123');
      expect(added).toBe(true);

      const config = readOpenClawConfig(configPath);
      expect(config.bindings).toHaveLength(1);
      expect(config.bindings?.[0]).toEqual({
        agentId: 'careagent-provider',
        match: {
          channel: 'telegram',
          peer: { kind: 'direct', id: 'user123' },
        },
      });
    });

    it('is idempotent — does not add duplicate binding', () => {
      addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user123');
      const added = addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user123');
      expect(added).toBe(false);

      const config = readOpenClawConfig(configPath);
      expect(config.bindings).toHaveLength(1);
    });

    it('allows different peers for the same agent', () => {
      addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user123');
      addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user456');

      const config = readOpenClawConfig(configPath);
      expect(config.bindings).toHaveLength(2);
    });

    it('allows different agents for the same peer', () => {
      addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user123');
      addPeerBinding(configPath, 'other-agent', 'telegram', 'user123');

      const config = readOpenClawConfig(configPath);
      expect(config.bindings).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // removePeerBinding
  // -------------------------------------------------------------------------

  describe('removePeerBinding', () => {
    it('removes an existing binding', () => {
      addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user123');
      const removed = removePeerBinding(configPath, 'careagent-provider', 'user123');
      expect(removed).toBe(true);

      const config = readOpenClawConfig(configPath);
      expect(config.bindings).toHaveLength(0);
    });

    it('returns false when binding does not exist', () => {
      const removed = removePeerBinding(configPath, 'careagent-provider', 'user123');
      expect(removed).toBe(false);
    });

    it('returns false when bindings array is empty', () => {
      writeOpenClawConfig(configPath, { bindings: [] });
      const removed = removePeerBinding(configPath, 'careagent-provider', 'user123');
      expect(removed).toBe(false);
    });

    it('preserves other bindings', () => {
      addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user123');
      addPeerBinding(configPath, 'careagent-provider', 'telegram', 'user456');
      removePeerBinding(configPath, 'careagent-provider', 'user123');

      const config = readOpenClawConfig(configPath);
      expect(config.bindings).toHaveLength(1);
      expect(config.bindings?.[0]?.match.peer.id).toBe('user456');
    });
  });

  // -------------------------------------------------------------------------
  // clearAgentSessions
  // -------------------------------------------------------------------------

  describe('clearAgentSessions', () => {
    it('does nothing when sessions dir does not exist', () => {
      // Should not throw
      expect(() => clearAgentSessions('nonexistent-agent')).not.toThrow();
    });

    it('deletes .jsonl files and resets sessions.json', () => {
      // Create fake sessions directory structure
      const sessionsDir = join(tmpDir, 'agents', 'test-agent', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, 'abc-123.jsonl'), '{"msg":"test"}', 'utf-8');
      writeFileSync(join(sessionsDir, 'def-456.jsonl'), '{"msg":"test2"}', 'utf-8');
      writeFileSync(join(sessionsDir, 'sessions.json'), '{"abc-123":{}}', 'utf-8');

      // Mock homedir by calling the internal path directly
      // Instead, we test the function behavior with the real path pattern
      // We need to use the actual function — construct the path it would use
      const { homedir } = require('node:os');
      const expectedDir = join(homedir(), '.openclaw', 'agents', 'test-agent-unit', 'sessions');

      // Create the directory at the expected location
      mkdirSync(expectedDir, { recursive: true });
      writeFileSync(join(expectedDir, 'sess-1.jsonl'), '{}', 'utf-8');
      writeFileSync(join(expectedDir, 'sessions.json'), '{"sess-1":{}}', 'utf-8');

      try {
        clearAgentSessions('test-agent-unit');

        expect(existsSync(join(expectedDir, 'sess-1.jsonl'))).toBe(false);
        const idx = readFileSync(join(expectedDir, 'sessions.json'), 'utf-8');
        expect(idx).toBe('{}');
      } finally {
        // Clean up
        rmSync(join(homedir(), '.openclaw', 'agents', 'test-agent-unit'), { recursive: true, force: true });
      }
    });
  });
});
