/**
 * Re-export shim — all types now live in src/adapters/types.ts.
 * This file preserves backward compatibility for existing imports.
 * @deprecated Import from '../adapters/types.js' instead.
 */
export type {
  ToolCallEvent,
  ToolCallResult,
  ToolCallHandler,
  BootstrapContext,
  BootstrapHandler,
  CliCommandConfig,
  ServiceConfig,
  SlashCommandConfig,
  PlatformAdapter,
  CareAgentPluginAPI,
} from '../adapters/types.js';
