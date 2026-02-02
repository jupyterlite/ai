import { Contents } from '@jupyterlab/services';

import { parseSkillMd } from './parse-skill';

/**
 * A skill definition loaded from the filesystem.
 */
export interface ISkillDefinition {
  name: string;
  description: string;
  instructions: string;
  path: string;
}

/**
 * Load skills from the filesystem by scanning a directory for subdirectories
 * containing SKILL.md files.
 *
 * @param contentsManager - The Jupyter contents manager
 * @param skillsPath - Path to the skills directory (e.g. ".jupyter/skills")
 * @returns Array of loaded skill definitions
 */
export async function loadSkills(
  contentsManager: Contents.IManager,
  skillsPath: string
): Promise<ISkillDefinition[]> {
  const skills: ISkillDefinition[] = [];

  let dirModel: Contents.IModel;
  try {
    dirModel = await contentsManager.get(skillsPath, { content: true });
  } catch (error) {
    // Directory doesn't exist — that's fine, no skills to load
    console.debug(`Skills directory "${skillsPath}" not found, skipping.`);
    return skills;
  }

  if (dirModel.type !== 'directory' || !dirModel.content) {
    return skills;
  }

  for (const child of dirModel.content as Contents.IModel[]) {
    if (child.type !== 'directory') {
      continue;
    }

    try {
      const skillMdPath = `${child.path}/SKILL.md`;
      const fileModel = await contentsManager.get(skillMdPath, {
        content: true
      });

      if (typeof fileModel.content !== 'string') {
        console.warn(`Skipping ${skillMdPath}: content is not a string`);
        continue;
      }

      const parsed = parseSkillMd(fileModel.content);
      skills.push({
        ...parsed,
        path: child.path
      });
    } catch (error) {
      console.warn(`Failed to load skill from "${child.path}":`, error);
    }
  }

  return skills;
}
