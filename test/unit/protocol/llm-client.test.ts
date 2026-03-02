/**
 * Tests for LLM client — mock fetch, request construction, error/timeout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMClient } from '../../../src/protocol/llm-client.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(response: unknown, status = 200): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  }) as unknown as typeof fetch;
}

function mockFetchError(error: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(error) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LLM Client', () => {
  const defaultConfig = { apiKey: 'test-key' };

  const mockResponse = {
    id: 'msg_123',
    content: [{ type: 'text', text: 'Hello!' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  };

  it('sends correct request to Anthropic API', async () => {
    mockFetch(mockResponse);
    const client = createLLMClient(defaultConfig);

    await client.chat({
      system: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const url = call[0] as string;
    const opts = call[1] as RequestInit;
    const body = JSON.parse(opts.body as string);

    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect((opts.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.system).toBe('You are helpful.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('uses custom model and maxTokens', async () => {
    mockFetch(mockResponse);
    const client = createLLMClient({
      apiKey: 'key',
      model: 'claude-opus-4-20250514',
      maxTokens: 2048,
    });

    await client.chat({
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
    });

    const body = JSON.parse(
      ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.model).toBe('claude-opus-4-20250514');
    expect(body.max_tokens).toBe(2048);
  });

  it('uses custom base URL', async () => {
    mockFetch(mockResponse);
    const client = createLLMClient({ apiKey: 'key', baseUrl: 'https://custom.api.com' });

    await client.chat({
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
    });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toBe('https://custom.api.com/v1/messages');
  });

  it('includes tools and tool_choice when provided', async () => {
    mockFetch(mockResponse);
    const client = createLLMClient(defaultConfig);

    const tool = {
      name: 'submit_answer',
      description: 'Submit an answer',
      input_schema: { type: 'object', properties: { value: { type: 'string' } } },
    };

    await client.chat({
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
      tools: [tool],
      tool_choice: { type: 'auto' },
    });

    const body = JSON.parse(
      ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe('submit_answer');
    expect(body.tool_choice).toEqual({ type: 'auto' });
  });

  it('omits tools when not provided', async () => {
    mockFetch(mockResponse);
    const client = createLLMClient(defaultConfig);

    await client.chat({
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
    });

    const body = JSON.parse(
      ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.tools).toBeUndefined();
  });

  it('returns parsed LLM response', async () => {
    mockFetch(mockResponse);
    const client = createLLMClient(defaultConfig);

    const result = await client.chat({
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.id).toBe('msg_123');
    expect(result.content).toHaveLength(1);
    expect(result.stop_reason).toBe('end_turn');
    expect(result.usage.input_tokens).toBe(10);
  });

  it('throws on non-ok response', async () => {
    mockFetch({ error: 'bad request' }, 400);
    const client = createLLMClient(defaultConfig);

    await expect(
      client.chat({
        system: 'test',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow('LLM API error 400');
  });

  it('throws on network error', async () => {
    mockFetchError(new Error('ECONNREFUSED'));
    const client = createLLMClient(defaultConfig);

    await expect(
      client.chat({
        system: 'test',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
