import { describe, it, expect } from 'vitest';
import { createMockTransport } from '../../../src/bot/telegram-client.js';
import { createTelegramIO } from '../../../src/bot/telegram-io.js';

describe('TelegramIO', () => {
  function makeTextUpdate(updateId: number, chatId: number, text: string) {
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        chat: { id: chatId, type: 'private' as const },
        date: Date.now(),
        text,
      },
    };
  }

  function makeCallbackUpdate(updateId: number, chatId: number, data: string) {
    return {
      update_id: updateId,
      callback_query: {
        id: String(updateId),
        from: { id: 1, is_bot: false, first_name: 'Test' },
        message: {
          message_id: updateId,
          chat: { id: chatId, type: 'private' as const },
          date: Date.now(),
        },
        data,
      },
    };
  }

  it('question() sends prompt and waits for text reply', async () => {
    const transport = createMockTransport();
    const io = createTelegramIO({ transport, chatId: 123, pollTimeoutMs: 1000 });

    // Queue the user's response before asking
    transport.queueUpdates([makeTextUpdate(1, 123, 'Dr. Smith')]);

    const answer = await io.question('What is your name?');
    expect(answer).toBe('Dr. Smith');

    const sent = transport.getSentMessages();
    expect(sent[0].text).toBe('What is your name?');
  });

  it('select() sends options as inline keyboard and returns index', async () => {
    const transport = createMockTransport();
    const io = createTelegramIO({ transport, chatId: 123, pollTimeoutMs: 1000 });

    transport.queueUpdates([makeCallbackUpdate(1, 123, '1')]);

    const selected = await io.select('Choose specialty:', ['Cardiology', 'Neurology', 'Orthopedics']);
    expect(selected).toBe(1);

    const sent = transport.getSentMessages();
    expect(sent[0].replyMarkup?.inline_keyboard).toHaveLength(3);
    expect(sent[0].replyMarkup?.inline_keyboard[0][0].text).toBe('Cardiology');
  });

  it('confirm() sends Yes/No keyboard and returns boolean', async () => {
    const transport = createMockTransport();
    const io = createTelegramIO({ transport, chatId: 123, pollTimeoutMs: 1000 });

    transport.queueUpdates([makeCallbackUpdate(1, 123, 'yes')]);

    const confirmed = await io.confirm('Do you prescribe medications?');
    expect(confirmed).toBe(true);

    const sent = transport.getSentMessages();
    expect(sent[0].replyMarkup?.inline_keyboard[0]).toHaveLength(2);
    expect(sent[0].replyMarkup?.inline_keyboard[0][0].text).toBe('Yes');
  });

  it('confirm() returns false on no', async () => {
    const transport = createMockTransport();
    const io = createTelegramIO({ transport, chatId: 123, pollTimeoutMs: 1000 });

    transport.queueUpdates([makeCallbackUpdate(1, 123, 'no')]);

    const confirmed = await io.confirm('Do you prescribe medications?');
    expect(confirmed).toBe(false);
  });

  it('display() sends message without waiting for response', () => {
    const transport = createMockTransport();
    const io = createTelegramIO({ transport, chatId: 123 });

    io.display('Welcome to provider onboarding!');

    // display is fire-and-forget, so just check it was called
    const sent = transport.getSentMessages();
    expect(sent[0].text).toBe('Welcome to provider onboarding!');
  });

  it('ignores messages from other chats', async () => {
    const transport = createMockTransport();
    const io = createTelegramIO({ transport, chatId: 123, pollTimeoutMs: 1000 });

    // Queue message from wrong chat, then correct chat
    transport.queueUpdates([
      makeTextUpdate(1, 999, 'Wrong chat'),
      makeTextUpdate(2, 123, 'Right chat'),
    ]);

    const answer = await io.question('prompt');
    expect(answer).toBe('Right chat');
  });

  it('injectUpdate() adds to pending queue', async () => {
    const transport = createMockTransport();
    const io = createTelegramIO({ transport, chatId: 123, pollTimeoutMs: 1000 });

    io.injectUpdate(makeTextUpdate(1, 123, 'injected'));
    const answer = await io.question('prompt');
    expect(answer).toBe('injected');
  });
});
