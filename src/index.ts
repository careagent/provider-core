/**
 * @careagent/core — Clinical activation layer for AI agents
 *
 * Default entry point re-exports the OpenClaw plugin registration.
 * OpenClaw discovers this via the `openclaw.extensions` field in package.json.
 *
 * For other entry points:
 *   - @careagent/core/standalone — activate() for non-OpenClaw environments
 *   - @careagent/core/core — pure type/class re-exports (no side effects)
 */

export { default } from './entry/openclaw.js';
