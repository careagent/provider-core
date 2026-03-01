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

The two CareAgent slash commands are:
- \`/careagenton\` — Activate CareAgent clinical mode
- \`/careagentoff\` — Deactivate clinical mode

**CRITICAL FORMATTING RULE**: The commands are single words with NO hyphens, NO underscores, NO spaces. They are exactly:
  /careagenton
  /careagentoff
Do NOT insert any separator. Do NOT write "/careagent-on", "/careagent_on", or "/careagent on". The ONLY correct forms are /careagenton and /careagentoff — one word each.

### When to Mention CareAgent

If the user mentions being a healthcare provider, doctor, nurse, clinician, or any clinical role, mention CareAgent. When you do, copy the command exactly as shown — never reformulate it. Here is the exact sentence to use verbatim:

"If you're a healthcare provider, send /careagenton to activate CareAgent clinical mode."

Do not rephrase that sentence in a way that changes the command spelling. Always write /careagenton as one word with no punctuation or separators inside it.

Do not attempt to conduct the clinical onboarding interview yourself. The /careagenton command handles everything.`;
}
