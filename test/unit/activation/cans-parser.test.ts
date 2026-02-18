import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../../src/activation/cans-parser.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with --- delimiters and returns parsed object and body', () => {
    const content = `---
title: Hello
count: 42
---
This is the body.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({ title: 'Hello', count: 42 });
    expect(result.body).toBe('This is the body.');
    expect(result.error).toBeUndefined();
  });

  it('returns frontmatter: null with "missing opening" error when content has no ---', () => {
    const content = 'Just some plain text without frontmatter.';
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
    expect(result.error).toContain('missing opening ---');
  });

  it('returns frontmatter: null with "no closing" error when closing --- is missing', () => {
    const content = `---
title: Hello
This is not closed.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
    expect(result.error).toContain('No closing --- delimiter');
  });

  it('returns frontmatter: null with "empty" error for empty frontmatter block', () => {
    const content = `---
---
Body text here.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('Body text here.');
    expect(result.error).toContain('empty');
  });

  it('returns frontmatter: null with "YAML parse error" for invalid YAML', () => {
    const content = `---
{{{
---
Body.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.error).toContain('YAML parse error');
  });

  it('returns frontmatter: null when YAML is an array (must be object)', () => {
    const content = `---
- item1
- item2
---
Body.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.error).toContain('must be an object');
  });

  it('correctly extracts body text after frontmatter', () => {
    const content = `---
key: value
---
# Heading

Paragraph text here.

More content.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({ key: 'value' });
    expect(result.body).toBe('# Heading\n\nParagraph text here.\n\nMore content.');
  });

  it('preserves YAML 1.2 behavior: NO remains a string, not converted to false', () => {
    const content = `---
country: NO
enabled: true
---
Body.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).not.toBeNull();
    // YAML 1.2 (yaml package default) treats NO as a string, not boolean
    expect(result.frontmatter!.country).toBe('NO');
    expect(result.frontmatter!.enabled).toBe(true);
  });

  it('handles leading whitespace before frontmatter', () => {
    const content = `

---
key: value
---
Body.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({ key: 'value' });
    expect(result.body).toBe('Body.');
  });

  it('handles nested YAML objects', () => {
    const content = `---
provider:
  name: Dr. Test
  license:
    type: MD
    state: TX
---
Body.`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!.provider).toEqual({
      name: 'Dr. Test',
      license: { type: 'MD', state: 'TX' },
    });
  });
});
