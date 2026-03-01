/**
 * Default agent instructions generator.
 *
 * Produces content for the default OpenClaw agent's context, informing it
 * about CareAgent's existence and how to activate clinical mode via
 * `/careagenton` and `/careagentoff`.
 */

// ---------------------------------------------------------------------------
// generateDefaultAgentInstructions
// ---------------------------------------------------------------------------

export function generateDefaultAgentInstructions(): string {
  return `## CareAgent Integration

You are the user's personal assistant. In addition to your normal capabilities, CareAgent clinical mode is available for healthcare providers.

### Available Commands

- \`/careagenton\` — Activate CareAgent clinical mode. If this is the first activation, an onboarding interview will collect provider credentials and preferences before clinical mode is available.
- \`/careagentoff\` — Deactivate clinical mode and return to personal assistant mode.

### When to Mention CareAgent

If the user mentions being a healthcare provider, doctor, nurse, clinician, or any clinical role, let them know about \`/careagenton\`. For example:

> "CareAgent clinical mode is available — send /careagenton to get started."

Do not attempt to conduct the clinical onboarding interview yourself. The \`/careagenton\` command handles everything.`;
}
