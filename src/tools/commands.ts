import { CommandRegistry } from '@lumino/commands';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { ITool } from '../tokens';
import { AISettingsModel } from '../models/settings-model';

/**
 * Create a tool to discover all available commands and their metadata
 */
export function createDiscoverCommandsTool(commands: CommandRegistry): ITool {
  return tool({
    name: 'discover_commands',
    description:
      'Discover all available JupyterLab commands with their metadata, arguments, and descriptions',
    parameters: z.object({
      // currently unused, but could be used to filter commands by a search term
      query: z
        .string()
        .optional()
        .nullable()
        .describe('Optional search query to filter commands')
    }),
    execute: async () => {
      try {
        const commandList: Array<{
          id: string;
          label?: string;
          caption?: string;
          description?: string;
          args?: any;
        }> = [];

        // Get all command IDs
        const commandIds = commands.listCommands();

        for (const id of commandIds) {
          try {
            // Get command metadata using various CommandRegistry methods
            const description = await commands.describedBy(id);
            const label = commands.label(id);
            const caption = commands.caption(id);
            const usage = commands.usage(id);

            commandList.push({
              id,
              label: label || undefined,
              caption: caption || undefined,
              description: usage || undefined,
              args: description?.args || undefined
            });
          } catch (error) {
            // Some commands might not have descriptions, skip them
            commandList.push({ id });
          }
        }

        return {
          success: true,
          commandCount: commandList.length,
          commands: commandList
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to discover commands: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
}

/**
 * Create a tool to execute a specific JupyterLab command
 */
export function createExecuteCommandTool(
  commands: CommandRegistry,
  settingsModel: AISettingsModel
): ITool {
  return tool({
    name: 'execute_command',
    description:
      'Execute a specific JupyterLab command with optional arguments',
    parameters: z.object({
      commandId: z.string().describe('The ID of the command to execute'),
      args: z
        .any()
        .optional()
        .describe('Optional arguments to pass to the command')
    }),
    needsApproval: async (_context, { commandId }) => {
      // Use configurable list of commands requiring approval
      const commandsRequiringApproval =
        settingsModel.config.commandsRequiringApproval;

      return commandsRequiringApproval.some(
        cmd => commandId.includes(cmd) || cmd.includes(commandId)
      );
    },
    execute: async (input: { commandId: string; args?: any }) => {
      const { commandId, args } = input;

      // Check if command exists
      if (!commands.hasCommand(commandId)) {
        return {
          success: false,
          error: `Command '${commandId}' does not exist. Use 'discover_commands' to see available commands.`
        };
      }

      try {
        // Execute the command
        const result = await commands.execute(commandId, args);

        // Handle Widget objects specially (including subclasses like DocumentWidget)
        let serializedResult;
        if (
          result &&
          typeof result === 'object' &&
          (result.constructor?.name?.includes('Widget') || result.id)
        ) {
          serializedResult = {
            type: result.constructor?.name || 'Widget',
            id: result.id,
            title: result.title?.label || result.title,
            className: result.className
          };
        } else {
          // For other objects, try JSON serialization with fallback
          try {
            serializedResult = JSON.parse(JSON.stringify(result));
          } catch {
            serializedResult = result
              ? '[Complex object - cannot serialize]'
              : 'Command executed successfully';
          }
        }

        return {
          success: true,
          commandId,
          result: serializedResult
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to execute command '${commandId}': ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
}
