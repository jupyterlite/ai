/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Summary information about a skill.
 */
export interface ISkillSummary {
  name: string;
  description: string;
}

/**
 * Full skill definition loaded from a SKILL.md file or registry.
 */
export interface ISkillDefinition extends ISkillSummary {
  instructions: string;
  resources: string[];
}

/**
 * Result for loading a skill resource.
 */
export interface ISkillResourceResult {
  name: string;
  resource: string;
  content?: string;
  error?: string;
}

/**
 * Skill registration payload for the skill registry.
 */
export interface ISkillRegistration extends ISkillDefinition {
  loadResource?: (resource: string) => Promise<ISkillResourceResult>;
}
