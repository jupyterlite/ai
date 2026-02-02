import { CommandRegistry } from '@lumino/commands';
import { Contents } from '@jupyterlab/services';
import { IDisposable } from '@lumino/disposable';

import { ISkillDefinition } from './skill-loader';

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
                'Optional path to a resource file relative to the skill directory'
            }
          }
        }
      },
      execute: async (args: any) => {
        if (args.resource) {
          const resourcePath = `${skill.path}/${args.resource}`;
          try {
            const fileModel = await contentsManager.get(resourcePath, {
              content: true
            });
            return {
              name: skill.name,
              resource: args.resource,
              content: fileModel.content
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
          instructions: skill.instructions
        };
      }
    });

    disposables.push(disposable);
  }

  return disposables;
}
