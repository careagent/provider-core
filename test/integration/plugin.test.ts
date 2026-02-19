/**
 * Integration tests for the plugin register() function and manifest verification.
 *
 * Verifies end-to-end behavior of the full plugin lifecycle:
 * - PLUG-01, PLUG-02: Manifest verification (package.json, openclaw.plugin.json)
 * - PLUG-03: register(api) wiring
 * - PLUG-04: Adapter insulation
 * - PLUG-05: Zero runtime dependencies
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import register from '../../src/index.js';
import { validCANSData } from '../fixtures/valid-cans-data.js';
import { stringifyYAML } from '../../src/vendor/yaml/index.js';

/**
 * Create a CANS.md file from structured data.
 */
function createCANSFile(dir: string, data: Record<string, unknown>): void {
  const yaml = stringifyYAML(data);
  const content = `---\n${yaml}---\n\n# Care Agent Nervous System\n`;
  const { writeFileSync } = require('node:fs');
  writeFileSync(join(dir, 'CANS.md'), content);
}

/**
 * Create a mock OpenClaw API that records all method calls.
 */
function createMockAPI(workspacePath: string) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    workspaceDir: workspacePath,
    registerCli: (cb: Function, opts: unknown) => {
      calls.push({ method: 'registerCli', args: [opts] });
      cb({ program: { command: () => ({ description: () => ({ action: () => {} }) }) } });
    },
    registerService: (config: unknown) => {
      calls.push({ method: 'registerService', args: [config] });
    },
    registerCommand: (config: unknown) => {
      calls.push({ method: 'registerCommand', args: [config] });
    },
    on: (event: string, handler: Function) => {
      calls.push({ method: 'on', args: [event, handler] });
    },
    log: (level: string, msg: string) => {
      calls.push({ method: 'log', args: [level, msg] });
    },
    calls,
  };
}

describe('Plugin Registration Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-plugin-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // PLUG-03: register(api) wiring
  // ---------------------------------------------------------------------------

  describe('PLUG-03: register(api) wiring', () => {
    it('with empty workspace: register completes, audit log contains inactive entry', () => {
      const api = createMockAPI(tmpDir);
      expect(() => register(api)).not.toThrow();

      // Audit log should exist with inactive entry
      const auditPath = join(tmpDir, '.careagent', 'AUDIT.log');
      expect(existsSync(auditPath)).toBe(true);

      const content = readFileSync(auditPath, 'utf-8');
      const entries = content.trimEnd().split('\n').map(l => JSON.parse(l));

      expect(entries.some(e =>
        e.action === 'activation_check' && e.outcome === 'inactive'
      )).toBe(true);
    });

    it('with valid CANS.md: register completes, audit log contains active entry', () => {
      createCANSFile(tmpDir, validCANSData);
      const api = createMockAPI(tmpDir);
      expect(() => register(api)).not.toThrow();

      const auditPath = join(tmpDir, '.careagent', 'AUDIT.log');
      const content = readFileSync(auditPath, 'utf-8');
      const entries = content.trimEnd().split('\n').map(l => JSON.parse(l));

      const activeEntry = entries.find(e =>
        e.action === 'activation_check' && e.outcome === 'active'
      );
      expect(activeEntry).toBeDefined();
      expect((activeEntry!.details as Record<string, unknown>).provider).toBe('Dr. Test Provider');
    });

    it('with valid CANS.md: registerCli was called', () => {
      createCANSFile(tmpDir, validCANSData);
      const api = createMockAPI(tmpDir);
      register(api);

      expect(api.calls.some(c => c.method === 'registerCli')).toBe(true);
    });

    it('with valid CANS.md: registerService was called', () => {
      createCANSFile(tmpDir, validCANSData);
      const api = createMockAPI(tmpDir);
      register(api);

      expect(api.calls.some(c => c.method === 'registerService')).toBe(true);
    });

    it('with valid CANS.md: on("before_tool_call") was called', () => {
      createCANSFile(tmpDir, validCANSData);
      const api = createMockAPI(tmpDir);
      register(api);

      expect(api.calls.some(c =>
        c.method === 'on' && (c.args as unknown[])[0] === 'before_tool_call'
      )).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // PLUG-04: Adapter insulation
  // ---------------------------------------------------------------------------

  describe('PLUG-04: Adapter insulation', () => {
    it('register works with minimal mock (just workspaceDir)', () => {
      expect(() => register({ workspaceDir: tmpDir })).not.toThrow();
    });

    it('register works with empty object (adapter falls back to process.cwd())', () => {
      expect(() => register({})).not.toThrow();
    });

    it('register does not throw when mock API is missing methods', () => {
      expect(() => register({ workspaceDir: tmpDir, on: null, registerCli: null })).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // PLUG-05: Zero dependencies verification
  // ---------------------------------------------------------------------------

  describe('PLUG-05: Zero dependencies verification', () => {
    it('package.json has no runtime dependencies', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      // dependencies should be empty or not present
      const deps = pkg.dependencies || {};
      expect(Object.keys(deps).length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // PLUG-01, PLUG-02: Manifest verification
  // ---------------------------------------------------------------------------

  describe('PLUG-01, PLUG-02: Manifest verification', () => {
    it('package.json openclaw.extensions points to ./dist/index.js', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.openclaw).toBeDefined();
      expect(pkg.openclaw.extensions).toContain('./dist/index.js');
    });

    it('openclaw.plugin.json has id @careagent/provider-core', () => {
      const pluginPath = join(__dirname, '../../openclaw.plugin.json');
      const plugin = JSON.parse(readFileSync(pluginPath, 'utf-8'));

      expect(plugin.id).toBe('@careagent/provider-core');
    });

    it('package.json peerDependencies includes openclaw', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.peerDependencies).toBeDefined();
      expect(pkg.peerDependencies.openclaw).toBeDefined();
    });

    it('package.json peerDependenciesMeta marks openclaw as optional', () => {
      const pkgPath = join(__dirname, '../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.peerDependenciesMeta).toBeDefined();
      expect(pkg.peerDependenciesMeta.openclaw).toBeDefined();
      expect(pkg.peerDependenciesMeta.openclaw.optional).toBe(true);
    });
  });
});
