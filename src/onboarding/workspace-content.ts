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
  const primaryOrg = provider.organizations.find((o) => o.primary) ?? provider.organizations[0];
  const lines: string[] = [];

  lines.push('## Clinical Persona', '');
  lines.push(
    `You are a clinical AI assistant for ${provider.name}, a ${provider.types.join('/')}${provider.specialty ? ` specializing in ${provider.specialty}` : ''}.`,
  );
  if (provider.subspecialty) {
    lines.push(`Your subspecialty focus is ${provider.subspecialty}.`);
  }
  if (primaryOrg) {
    lines.push(`You operate within ${primaryOrg.name}.`);
  }
  lines.push('');

  lines.push('## Clinical Philosophy', '');
  lines.push(philosophy);
  lines.push('');

  lines.push('## Scope Awareness', '');
  lines.push(
    `You are permitted to assist with: ${scope.permitted_actions.join(', ')}`,
  );

  const voice = data.voice;
  if (voice) {
    const voiceEntries = Object.entries(voice).filter(([, v]) => v !== undefined);
    if (voiceEntries.length > 0) {
      lines.push('');
      lines.push('## Voice', '');
      for (const [action, directive] of voiceEntries) {
        lines.push(`${action}: ${directive}`);
      }
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// AGENTS.md — Operating rules for the agent
// ---------------------------------------------------------------------------

export function generateAgentsContent(data: CANSDocument): string {
  const { provider, autonomy } = data;

  const lines: string[] = [];

  lines.push('## Clinical Safety Rules', '');
  lines.push(`1. NEVER provide clinical advice outside ${provider.specialty ?? 'your defined'} scope`);
  lines.push('2. ALWAYS flag when a request may exceed scope boundaries');
  lines.push('3. ALWAYS include appropriate disclaimers on generated clinical content');
  lines.push(
    '4. This system operates on SYNTHETIC DATA ONLY — never process real patient information',
  );
  lines.push('');

  lines.push('## Documentation Standards', '');
  lines.push("- All clinical notes must follow the provider's documentation style");
  lines.push('- Generated content is DRAFT until provider review');
  lines.push(
    `- Autonomy tiers: Chart=${autonomy.chart}, Order=${autonomy.order}, Charge=${autonomy.charge}, Perform=${autonomy.perform}, Interpret=${autonomy.interpret}, Educate=${autonomy.educate}, Coordinate=${autonomy.coordinate}`,
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
  const primaryOrg = provider.organizations.find((o) => o.primary) ?? provider.organizations[0];
  const lines: string[] = [];

  lines.push('## Provider Identity', '');
  lines.push(`- Name: ${provider.name}`);
  lines.push(`- Types: ${provider.types.join(', ')}`);
  if (provider.degrees.length > 0) {
    lines.push(`- Degrees: ${provider.degrees.join(', ')}`);
  }
  if (provider.licenses.length > 0) {
    lines.push(`- Licenses: ${provider.licenses.join(', ')}`);
  }
  if (provider.npi) {
    lines.push(`- NPI: ${provider.npi}`);
  }
  if (provider.specialty) {
    lines.push(`- Specialty: ${provider.specialty}`);
  }
  if (provider.subspecialty) {
    lines.push(`- Subspecialty: ${provider.subspecialty}`);
  }
  if (primaryOrg) {
    lines.push(`- Organization: ${primaryOrg.name}`);
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
  lines.push(`- Interpret autonomy: ${autonomy.interpret}`);
  lines.push(`- Educate autonomy: ${autonomy.educate}`);
  lines.push(`- Coordinate autonomy: ${autonomy.coordinate}`);

  return lines.join('\n');
}
