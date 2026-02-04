/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { parse as parseYaml } from 'yaml';

/**
 * Parsed skill definition from a SKILL.md file.
 */
export interface IParsedSkill {
  name: string;
  description: string;
  instructions: string;
}

/**
 * Parse a SKILL.md file content into a structured skill definition.
 *
 * Expected format:
 * ```
 * ---
 * name: my-skill
 * description: A brief description of the skill
 * ---
 * Full instructions body here...
 * ```
 *
 * @param content - The raw content of a SKILL.md file
 * @returns Parsed skill with name, description, and instructions
 * @throws Error if the frontmatter is missing or invalid
 */

export function parseSkillMd(content: string): IParsedSkill {
  const normalizedContent = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');

  if (lines[0]?.trim() !== '---') {
    throw new Error('Invalid SKILL.md: missing frontmatter delimiters (---)');
  }

  const frontmatterLines: string[] = [];
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '---') {
      break;
    }
    frontmatterLines.push(line);
  }

  if (i >= lines.length) {
    throw new Error('Invalid SKILL.md: missing frontmatter delimiters (---)');
  }

  const frontmatter = frontmatterLines.join('\n');
  const instructions = lines
    .slice(i + 1)
    .join('\n')
    .trim();

  let metadata: unknown;
  try {
    metadata = parseYaml(frontmatter);
  } catch (error) {
    throw new Error(
      `Invalid SKILL.md: YAML frontmatter parse failed: ${error}`
    );
  }

  const data = metadata as Record<string, unknown> | null;
  const name = data?.name;
  const description = data?.description;

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Invalid SKILL.md: missing "name" in frontmatter');
  }

  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new Error('Invalid SKILL.md: missing "description" in frontmatter');
  }

  return {
    name: name.trim(),
    description: description.trim(),
    instructions
  };
}
