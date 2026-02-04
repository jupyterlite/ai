/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { PathExt } from '@jupyterlab/coreutils';
import { Contents } from '@jupyterlab/services';
import { CommandRegistry } from '@lumino/commands';
import { IDisposable } from '@lumino/disposable';

import { ISkillDefinition } from './skill-loader';

/**
 * Arguments for skill command execution.
 */
interface ISkillCommandArgs {
  /**
   * Optional path to a resource file bundled inside the skill directory.
   */
  resource?: string;
}

/**
 * Result from executing a skill command without a resource argument.
 *
 * This is the primary payload returned to the agent when it requests the
 * definition of a skill.
 */
interface ISkillResult {
  /**
   * The skill name (also used in the command id: `skills:<name>`).
   */
  name: string;
  /**
   * Short, human-readable description of what the skill does.
   */
  description: string;
  /**
   * Detailed instructions that the agent should follow when using the skill.
   */
  instructions: string;
  /**
   * Optional list of resource file paths bundled with the skill.
   */
  resources?: string[];
}

/**
 * Result from executing a skill command with a resource argument.
 *
 * When `args.resource` is provided, the command returns either the resource
 * content on success or an error message on failure.
 */
interface ISkillResourceResult {
  /**
   * The skill name.
   */
  name: string;
  /**
   * The resource path as provided by the caller.
   */
  resource: string;
  /**
   * The resource file content.
   *
   * Present when the resource was read successfully.
   */
  content?: string;
  /**
   * Error message describing why the resource could not be read.
   */
  error?: string;
}

/**
 * Validate that a resource path is safe and stays within the skill directory.
 * Returns the validated path or null if the path is invalid.
 */
function validateResourcePath(resourcePath: string): string | null {
  // Reject absolute paths
  if (resourcePath.startsWith('/')) {
    return null;
  }

  // Normalize to resolve .. and . segments
  const normalized = PathExt.normalize(resourcePath);

  // After normalization, reject if it tries to escape (starts with ..)
  // or if it's empty (PathExt.normalize returns '' for empty input)
  if (normalized.startsWith('..') || normalized === '') {
    return null;
  }

  return normalized;
}

/**
 * Register JupyterLab commands for each skill definition.
 *
 * Each skill is registered as a `skills:<name>` command. When executed:
 * - With no args: returns the full skill definition (name, description, instructions)
 * - With `args.resource`: reads and returns the file content relative to the skill directory
 *
 * @param commands - The JupyterLab command registry
 * @param skills - Array of skill definitions to register
 * @param contentsManager - The Jupyter contents manager for reading resource files
 * @returns Array of disposables that remove the registered commands
 */
export function registerSkillCommands(
  commands: CommandRegistry,
  skills: ISkillDefinition[],
  contentsManager: Contents.IManager
): IDisposable[] {
  const disposables: IDisposable[] = [];

  for (const skill of skills) {
    const commandId = `skills:${skill.name}`;
    if (commands.hasCommand(commandId)) {
      console.warn(
        `Skipping duplicate skill name "${skill.name}" at ${skill.path}`
      );
      continue;
    }

    const disposable = commands.addCommand(commandId, {
      label: skill.name,
      caption: skill.description,
      usage: `Agent skill: ${skill.description}`,
      describedBy: {
        args: {
          type: 'object',
          properties: {
            resource: {
              type: 'string',
              description:
                'Optional path to a resource file bundled inside the skill directory (e.g. references or templates shipped with the skill). Do NOT use this for user workspace files — read those directly instead.'
            }
          }
        }
      },
      execute: async (
        args: ISkillCommandArgs
      ): Promise<ISkillResult | ISkillResourceResult> => {
        if (args.resource) {
          const validatedPath = validateResourcePath(args.resource);
          if (validatedPath === null) {
            return {
              name: skill.name,
              resource: args.resource,
              error: 'Invalid resource path: path traversal not allowed'
            };
          }

          const resourcePath = `${skill.path}/${validatedPath}`;
          try {
            const fileModel = await contentsManager.get(resourcePath, {
              content: true
            });
            return {
              name: skill.name,
              resource: args.resource,
              content: fileModel.content as string
            };
          } catch (error) {
            return {
              name: skill.name,
              resource: args.resource,
              error: `Failed to read resource: ${error}`
            };
          }
        }

        return {
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          ...(skill.resources.length > 0 && { resources: skill.resources })
        };
      }
    });
    disposables.push(disposable);
  }

  return disposables;
}
