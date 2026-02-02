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

  // Walk each path segment from root to verify the directory exists before
  // fetching it. Directly requesting a missing path causes a server-side 404
  // that can crash the Jupyter server in some environments (tornado bug).
  const segments = skillsPath.split('/').filter(s => s.length > 0);
  let currentPath = '';
  for (const segment of segments) {
    let listing: Contents.IModel;
    try {
      listing = await contentsManager.get(currentPath, { content: true });
    } catch {
      return skills;
    }
    const children = (listing.content ?? []) as Contents.IModel[];
    if (!children.some(c => c.type === 'directory' && c.name === segment)) {
      return skills;
    }
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
  }

  const dirModel = await contentsManager.get(skillsPath, { content: true });
  if (dirModel.type !== 'directory' || !dirModel.content) {
    return skills;
  }

  for (const child of dirModel.content as Contents.IModel[]) {
    if (child.type !== 'directory') {
      continue;
    }

    // List the subdirectory to check if SKILL.md exists before requesting it
    const subDir = await contentsManager.get(child.path, { content: true });
    const subChildren = (subDir.content ?? []) as Contents.IModel[];
    if (!subChildren.some(f => f.type === 'file' && f.name === 'SKILL.md')) {
      continue;
    }

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
  }

  return skills;
}
