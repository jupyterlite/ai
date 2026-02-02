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
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid SKILL.md: missing frontmatter delimiters (---)');
  }

  const frontmatter = match[1];
  const instructions = match[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch) {
    throw new Error('Invalid SKILL.md: missing "name" in frontmatter');
  }

  if (!descriptionMatch) {
    throw new Error('Invalid SKILL.md: missing "description" in frontmatter');
  }

  return {
    name: nameMatch[1].trim(),
    description: descriptionMatch[1].trim(),
    instructions
  };
}
