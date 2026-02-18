import { parseYAML } from '../vendor/yaml/index.js';

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
  error?: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith('---')) {
    return { frontmatter: null, body: content, error: 'No YAML frontmatter found (missing opening ---)' };
  }

  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content, error: 'No closing --- delimiter found for YAML frontmatter' };
  }

  const yamlBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).trim();

  if (!yamlBlock) {
    return { frontmatter: null, body, error: 'YAML frontmatter block is empty' };
  }

  try {
    const parsed = parseYAML(yamlBlock);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { frontmatter: null, body, error: 'YAML frontmatter must be an object (not array or scalar)' };
    }
    return { frontmatter: parsed as Record<string, unknown>, body };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { frontmatter: null, body: content, error: `YAML parse error: ${message}` };
  }
}
