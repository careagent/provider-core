import { describe, it, expect, vi } from 'vitest';
import { createStandaloneAdapter } from '../../../src/adapters/standalone/index.js';

describe('createStandaloneAdapter', () => {
  it('returns an adapter with platform "standalone"', () => {
    const adapter = createStandaloneAdapter('/test');
    expect(adapter.platform).toBe('standalone');
  });

  it('returns the provided workspace path', () => {
    const adapter = createStandaloneAdapter('/my/workspace');
    expect(adapter.getWorkspacePath()).toBe('/my/workspace');
  });

  it('defaults to process.cwd() when no workspace path given', () => {
    const adapter = createStandaloneAdapter();
    expect(adapter.getWorkspacePath()).toBe(process.cwd());
  });

  describe('no-op methods', () => {
    it('onBeforeToolCall does not throw', () => {
      const adapter = createStandaloneAdapter('/test');
      expect(() => adapter.onBeforeToolCall(() => ({ block: false }))).not.toThrow();
    });

    it('onAgentBootstrap does not throw', () => {
      const adapter = createStandaloneAdapter('/test');
      expect(() => adapter.onAgentBootstrap(() => {})).not.toThrow();
    });

    it('registerCliCommand does not throw', () => {
      const adapter = createStandaloneAdapter('/test');
      expect(() =>
        adapter.registerCliCommand({
          name: 'test',
          description: 'test',
          handler: vi.fn(),
        }),
      ).not.toThrow();
    });

    it('registerBackgroundService does not throw', () => {
      const adapter = createStandaloneAdapter('/test');
      expect(() =>
        adapter.registerBackgroundService({ id: 'test', start: vi.fn() }),
      ).not.toThrow();
    });

    it('registerSlashCommand does not throw', () => {
      const adapter = createStandaloneAdapter('/test');
      expect(() =>
        adapter.registerSlashCommand({
          name: '/test',
          description: 'test',
          handler: vi.fn(),
        }),
      ).not.toThrow();
    });
  });

  describe('log', () => {
    it('logs to console.info', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = createStandaloneAdapter('/test');
      adapter.log('info', 'test message');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('test message'));
      spy.mockRestore();
    });

    it('logs to console.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = createStandaloneAdapter('/test');
      adapter.log('warn', 'warning message');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('warning message'));
      spy.mockRestore();
    });

    it('logs to console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = createStandaloneAdapter('/test');
      adapter.log('error', 'error message');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('error message'));
      spy.mockRestore();
    });

    it('passes data as second console argument', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = createStandaloneAdapter('/test');
      adapter.log('info', 'test', { detail: 'x' });
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('test'),
        { detail: 'x' },
      );
      spy.mockRestore();
    });
  });
});
