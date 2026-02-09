/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { Contents } from '@jupyterlab/services';

import { parseSkillMd, IParsedSkill } from './parse-skill';

/**
 * A skill definition loaded from the filesystem.
 */
export interface ISkillFileDefinition extends IParsedSkill {
  /**
   * Path to the skill directory (e.g. ".agents/skills/my-skill").
   */
  path: string;
  /**
   * Paths to resource files relative to the skill directory.
   */
  resources: string[];
}

/**
 * Load skills from multiple directories. Each path is scanned in order;
 * when the same skill name appears in more than one path, the first
 * occurrence wins.
 *
 * @param contentsManager - The Jupyter contents manager
 * @param skillsPaths - Ordered list of directories to scan
 * @returns Merged array of loaded skill definitions
 */
export async function loadSkillsFromPaths(
  contentsManager: Contents.IManager,
  skillsPaths: string[]
): Promise<ISkillFileDefinition[]> {
  const seen = new Set<string>();
  const merged: ISkillFileDefinition[] = [];

  for (const skillsPath of skillsPaths) {
    const skills = await loadSkills(contentsManager, skillsPath);
    for (const skill of skills) {
      if (seen.has(skill.name)) {
        console.debug(
          `Skipping duplicate skill "${skill.name}" from "${skillsPath}" (already loaded from an earlier path).`
        );
        continue;
      }
      seen.add(skill.name);
      merged.push(skill);
    }
  }

  return merged;
}

/**
 * Load skills from the filesystem by scanning a directory for subdirectories
 * containing SKILL.md files.
 *
 * @param contentsManager - The Jupyter contents manager
 * @param skillsPath - Path to the skills directory (e.g. ".agents/skills")
 * @returns Array of loaded skill definitions
 */
async function loadSkills(
  contentsManager: Contents.IManager,
  skillsPath: string
): Promise<ISkillFileDefinition[]> {
  const skills: ISkillFileDefinition[] = [];

  // Walk each path segment from root to verify the directory exists before fetching it.
  const segments = skillsPath.split('/').filter(s => s.length > 0);
  let currentPath = '';
  for (const segment of segments) {
    let listing: Contents.IModel;
    try {
      listing = await contentsManager.get(currentPath, { content: true });
    } catch (error) {
      console.debug(
        `Skills path segment not found at "${currentPath}":`,
        error
      );
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

    try {
      const parsed = parseSkillMd(fileModel.content);
      const resources = await collectResourcePaths(contentsManager, child.path);
      skills.push({
        ...parsed,
        path: child.path,
        resources
      });
    } catch (error) {
      console.warn(`Skipping skill at ${child.path}:`, error);
    }
  }

  return skills;
}

/**
 * Recursively collect paths to all resource files in a skill directory,
 * excluding `SKILL.md`. Content is loaded on-demand when the agent
 * requests a specific resource.
 */
async function collectResourcePaths(
  contentsManager: Contents.IManager,
  basePath: string
): Promise<string[]> {
  const resourcePaths: string[] = [];

  async function walk(dirPath: string): Promise<void> {
    let dirModel: Contents.IModel;
    try {
      dirModel = await contentsManager.get(dirPath, { content: true });
    } catch (error) {
      console.warn(`Failed to list directory ${dirPath}:`, error);
      return;
    }
    if (dirModel.type !== 'directory' || !dirModel.content) {
      return;
    }
    for (const item of dirModel.content as Contents.IModel[]) {
      // Skip checkpoint directories
      if (item.name === '.ipynb_checkpoints') {
        continue;
      }
      if (item.type === 'directory') {
        await walk(item.path);
      } else if (item.type === 'file' && item.name !== 'SKILL.md') {
        // Store path relative to the skill directory
        const relativePath = item.path.slice(basePath.length + 1);
        resourcePaths.push(relativePath);
      }
    }
  }

  await walk(basePath);
  return resourcePaths;
}
