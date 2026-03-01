import { describe, it, expect } from 'vitest';
import { createMockTransport } from '../../../src/bot/telegram-client.js';

describe('createMockTransport', () => {
  it('records sendMessage calls', async () => {
    const transport = createMockTransport();
    await transport.sendMessage(123, 'Hello');
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe('sendMessage');
    expect(transport.calls[0].args[0]).toBe(123);
    expect(transport.calls[0].args[1]).toBe('Hello');
  });

  it('tracks sent messages', async () => {
    const transport = createMockTransport();
    await transport.sendMessage(123, 'Hello');
    await transport.sendMessage(456, 'World');
    const sent = transport.getSentMessages();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({ chatId: 123, text: 'Hello', replyMarkup: undefined });
    expect(sent[1]).toEqual({ chatId: 456, text: 'World', replyMarkup: undefined });
  });

  it('returns ok from sendMessage', async () => {
    const transport = createMockTransport();
    const result = await transport.sendMessage(123, 'test');
    expect(result.ok).toBe(true);
    expect(result.result?.chat.id).toBe(123);
  });

  it('returns queued updates from getUpdates', async () => {
    const transport = createMockTransport();
    const updates = [
      { update_id: 1, message: { message_id: 1, chat: { id: 123, type: 'private' as const }, date: Date.now(), text: 'hi' } },
    ];
    transport.queueUpdates(updates);
    const result = await transport.getUpdates(0, 5);
    expect(result).toEqual(updates);
  });

  it('returns empty array when no updates queued', async () => {
    const transport = createMockTransport();
    const result = await transport.getUpdates(0, 5);
    expect(result).toEqual([]);
  });

  it('records getUpdates calls', async () => {
    const transport = createMockTransport();
    await transport.getUpdates(5, 10);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe('getUpdates');
    expect(transport.calls[0].args).toEqual([5, 10]);
  });

  it('supports inline keyboard in sendMessage', async () => {
    const transport = createMockTransport();
    const keyboard = { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] };
    await transport.sendMessage(123, 'Confirm?', keyboard);
    const sent = transport.getSentMessages();
    expect(sent[0].replyMarkup).toEqual(keyboard);
  });
});
