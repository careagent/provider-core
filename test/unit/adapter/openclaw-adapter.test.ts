import { describe, it, expect, vi } from 'vitest';
import { createAdapter } from '../../../src/adapter/openclaw-adapter.js';

describe('createAdapter', () => {
  it('does not throw when given an empty object', () => {
    expect(() => createAdapter({})).not.toThrow();
  });

  it('does not throw when given undefined', () => {
    expect(() => createAdapter(undefined)).not.toThrow();
  });

  describe('getWorkspacePath', () => {
    it('returns process.cwd() when no workspace properties exist', () => {
      const adapter = createAdapter({});
      expect(adapter.getWorkspacePath()).toBe(process.cwd());
    });

    it('returns api.workspaceDir when set', () => {
      const adapter = createAdapter({ workspaceDir: '/test/workspace' });
      expect(adapter.getWorkspacePath()).toBe('/test/workspace');
    });

    it('returns api.config.workspaceDir as second priority', () => {
      const adapter = createAdapter({ config: { workspaceDir: '/config/workspace' } });
      expect(adapter.getWorkspacePath()).toBe('/config/workspace');
    });

    it('returns api.context.workspaceDir as third priority', () => {
      const adapter = createAdapter({ context: { workspaceDir: '/context/workspace' } });
      expect(adapter.getWorkspacePath()).toBe('/context/workspace');
    });

    it('prefers api.workspaceDir over api.config.workspaceDir', () => {
      const adapter = createAdapter({
        workspaceDir: '/direct',
        config: { workspaceDir: '/config' },
      });
      expect(adapter.getWorkspacePath()).toBe('/direct');
    });
  });

  describe('onBeforeToolCall', () => {
    it('does not throw when api.on is missing', () => {
      const adapter = createAdapter({});
      expect(() => adapter.onBeforeToolCall(() => ({ block: false }))).not.toThrow();
    });

    it('calls api.on with before_tool_call event', () => {
      const onSpy = vi.fn();
      const adapter = createAdapter({ on: onSpy });
      const handler = () => ({ block: false });
      adapter.onBeforeToolCall(handler);
      expect(onSpy).toHaveBeenCalledWith('before_tool_call', handler);
    });
  });

  describe('onAgentBootstrap', () => {
    it('does not throw when api.on is missing', () => {
      const adapter = createAdapter({});
      expect(() => adapter.onAgentBootstrap(() => {})).not.toThrow();
    });

    it('calls api.on with agent:bootstrap event', () => {
      const onSpy = vi.fn();
      const adapter = createAdapter({ on: onSpy });
      const handler = () => {};
      adapter.onAgentBootstrap(handler);
      expect(onSpy).toHaveBeenCalledWith('agent:bootstrap', handler);
    });
  });

  describe('registerCliCommand', () => {
    it('calls api.registerCli when available', () => {
      const registerCliSpy = vi.fn();
      const adapter = createAdapter({ registerCli: registerCliSpy });
      const config = {
        name: 'test-cmd',
        description: 'A test command',
        handler: vi.fn(),
      };
      adapter.registerCliCommand(config);
      expect(registerCliSpy).toHaveBeenCalledTimes(1);
      // Verify the callback shape: first arg is a function, second is command metadata
      expect(registerCliSpy).toHaveBeenCalledWith(
        expect.any(Function),
        { commands: ['test-cmd'] },
      );
    });

    it('does not throw when api.registerCli is missing', () => {
      const adapter = createAdapter({});
      expect(() =>
        adapter.registerCliCommand({
          name: 'test',
          description: 'test',
          handler: vi.fn(),
        }),
      ).not.toThrow();
    });
  });

  describe('registerBackgroundService', () => {
    it('calls api.registerService when available', () => {
      const registerServiceSpy = vi.fn();
      const adapter = createAdapter({ registerService: registerServiceSpy });
      const config = { id: 'test-svc', start: vi.fn() };
      adapter.registerBackgroundService(config);
      expect(registerServiceSpy).toHaveBeenCalledWith(config);
    });

    it('does not throw when api.registerService is missing', () => {
      const adapter = createAdapter({});
      expect(() =>
        adapter.registerBackgroundService({ id: 'test', start: vi.fn() }),
      ).not.toThrow();
    });
  });

  describe('registerSlashCommand', () => {
    it('calls api.registerCommand when available', () => {
      const registerCommandSpy = vi.fn();
      const adapter = createAdapter({ registerCommand: registerCommandSpy });
      const config = { name: '/test', description: 'test', handler: vi.fn() };
      adapter.registerSlashCommand(config);
      expect(registerCommandSpy).toHaveBeenCalledWith(config);
    });

    it('does not throw when api.registerCommand is missing', () => {
      const adapter = createAdapter({});
      expect(() =>
        adapter.registerSlashCommand({ name: '/test', description: 'test', handler: vi.fn() }),
      ).not.toThrow();
    });
  });

  describe('log', () => {
    it('falls back to console when api.log is missing', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = createAdapter({});
      adapter.log('info', 'test message');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('test message'),
      );
      consoleSpy.mockRestore();
    });

    it('calls api.log when available', () => {
      const logSpy = vi.fn();
      const adapter = createAdapter({ log: logSpy });
      adapter.log('error', 'test error', { detail: 'x' });
      expect(logSpy).toHaveBeenCalledWith('error', 'test error', { detail: 'x' });
    });

    it('falls back to console when api.log throws', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = createAdapter({
        log: () => { throw new Error('broken'); },
      });
      adapter.log('warn', 'fallback test');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('fallback test'),
      );
      consoleSpy.mockRestore();
    });
  });
});
