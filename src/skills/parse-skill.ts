/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import matter from 'gray-matter';

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
  const parsed = matter(content);
  const instructions = parsed.content.trim();
  const data = parsed.data as Record<string, unknown> | null;
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
