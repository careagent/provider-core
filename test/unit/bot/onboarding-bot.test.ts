import { describe, it, expect, vi } from 'vitest';
import { createMockTransport } from '../../../src/bot/telegram-client.js';
import { createProviderOnboardingBot } from '../../../src/bot/onboarding-bot.js';
import type { TelegramUpdate } from '../../../src/bot/telegram-client.js';

function makeTextUpdate(updateId: number, chatId: number, text: string): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: chatId, type: 'private' },
      date: Date.now(),
      text,
    },
  };
}

describe('ProviderOnboardingBot', () => {
  it('responds to unknown messages with start prompt', async () => {
    const transport = createMockTransport();
    const bot = createProviderOnboardingBot({
      transport,
      workspacePath: '/tmp/test-workspace',
    });

    await bot.handleUpdate(makeTextUpdate(1, 123, 'hello'));

    const sent = transport.getSentMessages();
    expect(sent[0].text).toContain('/start');
  });

  it('ignores updates without text', async () => {
    const transport = createMockTransport();
    const bot = createProviderOnboardingBot({
      transport,
      workspacePath: '/tmp/test-workspace',
    });

    await bot.handleUpdate({ update_id: 1 });

    const sent = transport.getSentMessages();
    expect(sent).toHaveLength(0);
  });

  it('prevents double interview on same chat', async () => {
    const transport = createMockTransport();
    const bot = createProviderOnboardingBot({
      transport,
      workspacePath: '/tmp/test-workspace',
    });

    // Start interview (will run async)
    await bot.handleUpdate(makeTextUpdate(1, 123, '/start'));
    // Try to start again immediately
    await bot.handleUpdate(makeTextUpdate(2, 123, '/start'));

    const sent = transport.getSentMessages();
    const doubleStartMsg = sent.find(m => m.text.includes('already in progress'));
    expect(doubleStartMsg).toBeDefined();
  });

  it('tracks sessions', async () => {
    const transport = createMockTransport();
    const bot = createProviderOnboardingBot({
      transport,
      workspacePath: '/tmp/test-workspace',
    });

    // Before any interaction
    expect(bot.getActiveSessions().size).toBe(0);

    // Start interview
    await bot.handleUpdate(makeTextUpdate(1, 123, '/start'));

    // Session should be tracked
    expect(bot.getActiveSessions().size).toBe(1);
    const session = bot.getActiveSessions().get(123);
    expect(session?.state).toBe('interviewing');
  });

  it('startPolling returns stop function', () => {
    const transport = createMockTransport();
    const bot = createProviderOnboardingBot({
      transport,
      workspacePath: '/tmp/test-workspace',
    });

    const { stop } = bot.startPolling();
    expect(typeof stop).toBe('function');
    stop(); // Clean up
  });
});
