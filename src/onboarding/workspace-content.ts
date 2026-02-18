/**
 * Clinical content generators for workspace files.
 *
 * Pure functions that generate the clinical sections to be inserted into
 * SOUL.md, AGENTS.md, and USER.md via the workspace supplement writer.
 *
 * All conditional sections are omitted entirely when their source field
 * is absent — never rendered empty.
 */

import type { CANSDocument } from '../activation/cans-schema.js';

// ---------------------------------------------------------------------------
// SOUL.md — Agent persona and behavioral boundaries
// ---------------------------------------------------------------------------

export function generateSoulContent(data: CANSDocument, philosophy: string): string {
  const { provider, scope } = data;
  const lines: string[] = [];

  lines.push('## Clinical Persona', '');
  lines.push(
    `You are a clinical AI assistant for ${provider.name}, a ${provider.license.type} specializing in ${provider.specialty}.`,
  );
  if (provider.subspecialty) {
    lines.push(`Your subspecialty focus is ${provider.subspecialty}.`);
  }
  if (provider.institution) {
    lines.push(`You operate within ${provider.institution}.`);
  }
  lines.push('');

  lines.push('## Clinical Philosophy', '');
  lines.push(philosophy);
  lines.push('');

  lines.push('## Scope Awareness', '');
  lines.push(
    `You are permitted to assist with: ${scope.permitted_actions.join(', ')}`,
  );
  if (scope.prohibited_actions && scope.prohibited_actions.length > 0) {
    lines.push(
      `You must NEVER assist with: ${scope.prohibited_actions.join(', ')}`,
    );
  }
  if (scope.institutional_limitations && scope.institutional_limitations.length > 0) {
    lines.push(
      `Institutional limitations: ${scope.institutional_limitations.join(', ')}`,
    );
  }

  const voice = data.clinical_voice;
  if (voice) {
    lines.push('');
    lines.push('## Voice', '');
    if (voice.tone) {
      lines.push(`Tone: ${voice.tone}`);
    }
    if (voice.documentation_style) {
      lines.push(`Documentation style: ${voice.documentation_style}`);
    }
    if (voice.eponyms !== undefined) {
      lines.push(`Use medical eponyms: ${voice.eponyms ? 'yes' : 'no'}`);
    }
    if (voice.abbreviations) {
      lines.push(`Abbreviation style: ${voice.abbreviations}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// AGENTS.md — Operating rules for the agent
// ---------------------------------------------------------------------------

export function generateAgentsContent(data: CANSDocument): string {
  const { provider, scope, autonomy } = data;
  const prohibitedList =
    scope.prohibited_actions && scope.prohibited_actions.length > 0
      ? scope.prohibited_actions.join(', ')
      : 'none defined';

  const lines: string[] = [];

  lines.push('## Clinical Safety Rules', '');
  lines.push(`1. NEVER provide clinical advice outside ${provider.specialty} scope`);
  lines.push(`2. NEVER generate content for prohibited actions: ${prohibitedList}`);
  lines.push('3. ALWAYS flag when a request may exceed institutional limitations');
  lines.push('4. ALWAYS include appropriate disclaimers on generated clinical content');
  lines.push(
    '5. This system operates on SYNTHETIC DATA ONLY — never process real patient information',
  );
  lines.push('');

  lines.push('## Documentation Standards', '');
  lines.push("- All clinical notes must follow the provider's documentation style");
  lines.push('- Generated content is DRAFT until provider review');
  lines.push(
    `- Autonomy tiers: Chart=${autonomy.chart}, Order=${autonomy.order}, Charge=${autonomy.charge}, Perform=${autonomy.perform}`,
  );
  lines.push("- Actions at 'manual' tier require explicit provider initiation");
  lines.push("- Actions at 'supervised' tier require provider approval before execution");
  lines.push('');

  lines.push('## Audit Compliance', '');
  lines.push('- Every action is logged to the audit trail');
  lines.push('- Every blocked action is logged with rationale');
  lines.push('- The audit trail is append-only and hash-chained');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// USER.md — Provider identity and preferences
// ---------------------------------------------------------------------------

export function generateUserContent(data: CANSDocument): string {
  const { provider, autonomy } = data;
  const lines: string[] = [];

  lines.push('## Provider Identity', '');
  lines.push(`- Name: ${provider.name}`);
  lines.push(
    `- License: ${provider.license.type} (${provider.license.state}) #${provider.license.number}`,
  );
  if (provider.npi) {
    lines.push(`- NPI: ${provider.npi}`);
  }
  lines.push(`- Specialty: ${provider.specialty}`);
  if (provider.subspecialty) {
    lines.push(`- Subspecialty: ${provider.subspecialty}`);
  }
  if (provider.institution) {
    lines.push(`- Institution: ${provider.institution}`);
  }
  lines.push(
    `- Credential Status: ${provider.credential_status ?? 'active'}`,
  );
  lines.push('');

  lines.push('## Preferences', '');
  lines.push(`- Chart autonomy: ${autonomy.chart}`);
  lines.push(`- Order autonomy: ${autonomy.order}`);
  lines.push(`- Charge autonomy: ${autonomy.charge}`);
  lines.push(`- Perform autonomy: ${autonomy.perform}`);

  return lines.join('\n');
}
