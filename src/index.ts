/**
 * @careagent/core — Clinical activation layer for OpenClaw
 *
 * This is the plugin entry point. OpenClaw discovers this via the
 * `openclaw.extensions` field in package.json and calls the default
 * export with the plugin API.
 *
 * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline.
 * Later phases add: Onboarding, Hardening, Skills, CLI.
 */
export default function register(api: unknown): void {
  // Will be implemented in Plan 05 after all subsystems are built.
  // Stub ensures the build succeeds and the plugin loads without error.
  console.log('[CareAgent] Plugin loaded (stub — not yet wired)');
}
