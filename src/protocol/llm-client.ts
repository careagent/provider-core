/**
 * LLM Client — direct Anthropic Claude API calls with zero OpenClaw context.
 * Uses Node 22 native fetch(). No runtime dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | LLMContentBlock[];
}

export type LLMContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMChatParams {
  system: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  tool_choice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
}

export interface LLMResponse {
  id: string;
  content: LLMContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input_tokens: number; output_tokens: number };
}

export interface LLMClient {
  chat(params: LLMChatParams): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLLMClient(config: LLMClientConfig): LLMClient {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    baseUrl = DEFAULT_BASE_URL,
  } = config;

  return {
    async chat(params: LLMChatParams): Promise<LLMResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          system: params.system,
          messages: params.messages,
        };

        if (params.tools && params.tools.length > 0) {
          body.tools = params.tools;
        }
        if (params.tool_choice) {
          body.tool_choice = params.tool_choice;
        }

        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => 'unknown');
          throw new Error(`LLM API error ${res.status}: ${text}`);
        }

        const data = await res.json() as {
          id: string;
          content: LLMContentBlock[];
          stop_reason: LLMResponse['stop_reason'];
          usage: LLMResponse['usage'];
        };

        return {
          id: data.id,
          content: data.content,
          stop_reason: data.stop_reason,
          usage: data.usage,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
