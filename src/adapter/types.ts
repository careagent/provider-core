/**
 * CareAgent adapter types — the interface boundary between CareAgent and OpenClaw.
 *
 * All CareAgent code interacts with OpenClaw exclusively through these types.
 * The adapter layer translates between these stable interfaces and whatever
 * OpenClaw's API looks like at any given version.
 */

/** Event passed to tool call handlers before execution. */
export interface ToolCallEvent {
  toolName: string;
  method?: string;
  params?: Record<string, unknown>;
  sessionKey?: string;
}

/** Result returned from a tool call handler to allow or block execution. */
export interface ToolCallResult {
  block: boolean;
  blockReason?: string;
}

/** Handler invoked before every tool call — can block execution. */
export type ToolCallHandler = (call: ToolCallEvent) => ToolCallResult;

/** Context provided during agent bootstrap for injecting workspace files. */
export interface BootstrapContext {
  addFile(name: string, content: string): void;
}

/** Handler invoked during agent bootstrap to inject clinical context. */
export type BootstrapHandler = (context: BootstrapContext) => void;

/** Configuration for registering a CLI command. */
export interface CliCommandConfig {
  name: string;
  description: string;
  handler: (...args: unknown[]) => void | Promise<void>;
}

/** Configuration for registering a background service. */
export interface ServiceConfig {
  id: string;
  start: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
}

/** Configuration for registering a slash command. */
export interface SlashCommandConfig {
  name: string;
  description: string;
  handler: (args: string) => void | Promise<void>;
}

/**
 * The main interface for all OpenClaw interactions.
 *
 * CareAgent subsystems depend on this interface, never on OpenClaw's raw API.
 * The adapter implementation (openclaw-adapter.ts) translates between the two.
 */
export interface CareAgentPluginAPI {
  /** Returns the workspace directory path. */
  getWorkspacePath(): string;

  /** Registers a handler invoked before every tool call. */
  onBeforeToolCall(handler: ToolCallHandler): void;

  /** Registers a handler invoked during agent bootstrap. */
  onAgentBootstrap(handler: BootstrapHandler): void;

  /** Registers a CLI command with OpenClaw. */
  registerCliCommand(config: CliCommandConfig): void;

  /** Registers a background service with OpenClaw. */
  registerBackgroundService(config: ServiceConfig): void;

  /** Registers a slash command with OpenClaw. */
  registerSlashCommand(config: SlashCommandConfig): void;

  /** Logs a message through OpenClaw's logging system. */
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}
