/**
 * Skill framework types — plain TypeScript interfaces for the skill system.
 *
 * These are NOT TypeBox schemas. The TypeBox schema for manifest validation
 * lives in manifest-schema.ts. These interfaces are used throughout the
 * skill loader, integrity checker, and chart-skill modules.
 */

export interface SkillManifest {
  skill_id: string;
  version: string;
  requires: {
    license?: string[];
    specialty?: string[];
    privilege?: string[];
  };
  files: Record<string, string>; // filename -> sha256 hex hash
  pinned: boolean;
  approved_version: string;
}

export interface SkillLoadResult {
  skillId: string;
  loaded: boolean;
  reason?: string; // present when loaded=false
  version?: string; // present when loaded=true
  directory?: string; // present when loaded=true
}

export interface TemplateSection {
  name: string;
  required: boolean;
  description: string;
  format?: 'text' | 'list' | 'table';
}

export interface ChartTemplate {
  templateId: string;
  name: string;
  sections: TemplateSection[];
  version: string;
}

export interface VoiceDirectives {
  tone?: string;
  documentationStyle?: string;
  useEponyms?: boolean;
  abbreviationStyle?: string;
}
