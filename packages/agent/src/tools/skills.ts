import { tool } from 'ai';
import { z } from 'zod';
import { ISkillRegistry, ITool } from '../tokens';

/**
 * Create a tool to discover available skills and their summaries.
 */
export function createDiscoverSkillsTool(skillRegistry: ISkillRegistry): ITool {
  return tool({
    title: 'Discover Skills',
    description:
      'Discover available agent skills with their names and descriptions',
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .nullable()
        .describe('Optional search query to filter skills')
    }),
    execute: async (input: { query?: string | null }) => {
      const filtered = skillRegistry.listSkills(input.query ?? undefined);

      return {
        success: true,
        skillCount: filtered.length,
        skills: filtered
      };
    }
  });
}

/**
 * Create a tool to load skill instructions or a bundled resource.
 */
export function createLoadSkillTool(skillRegistry: ISkillRegistry): ITool {
  return tool({
    title: 'Load Skill',
    description:
      'Load a skill definition or a specific resource file bundled with a skill',
    inputSchema: z.object({
      name: z.string().describe('The name of the skill to load'),
      resource: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Optional resource path to load from the skill (e.g. references/REFERENCE.md)'
        )
    }),
    execute: async (input: { name: string; resource?: string | null }) => {
      const { name, resource } = input;

      if (resource) {
        const result = await skillRegistry.getSkillResource(name, resource);
        if (result.error) {
          return {
            success: false,
            ...result
          };
        }
        return {
          success: true,
          ...result
        };
      }

      const skill = skillRegistry.getSkill(name);
      if (!skill) {
        return {
          success: false,
          error: `Skill not found: ${name}`
        };
      }

      return {
        success: true,
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        ...(skill.resources.length > 0 && { resources: skill.resources })
      };
    }
  });
}
