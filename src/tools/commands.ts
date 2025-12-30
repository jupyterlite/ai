import { CommandRegistry } from '@lumino/commands';
import { tool } from 'ai';
import { z } from 'zod';
import { ITool } from '../tokens';
import { AISettingsModel } from '../models/settings-model';

/**
 * Create a tool to discover all available commands and their metadata
 */
export function createDiscoverCommandsTool(commands: CommandRegistry): ITool {
  return tool({
    title: 'Discover Commands',
    description:
      'Discover all available JupyterLab commands with their metadata, arguments, and descriptions',
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .nullable()
        .describe('Optional search query to filter commands')
    }),
    execute: async (input: { query?: string | null }) => {
      const { query } = input;
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
        // Get command metadata using various CommandRegistry methods
        const description = await commands.describedBy(id);
        const label = commands.label(id);
        const caption = commands.caption(id);
        const usage = commands.usage(id);

        const command = {
          id,
          label: label || undefined,
          caption: caption || undefined,
          description: usage || undefined,
          args: description?.args || undefined
        };

        // Filter by query if provided
        if (query) {
          const searchTerm = query.toLowerCase();
          const matchesQuery =
            id.toLowerCase().includes(searchTerm) ||
            label?.toLowerCase().includes(searchTerm) ||
            caption?.toLowerCase().includes(searchTerm) ||
            usage?.toLowerCase().includes(searchTerm);

          if (matchesQuery) {
            commandList.push(command);
          }
        } else {
          commandList.push(command);
        }
      }

      return {
        success: true,
        commandCount: commandList.length,
        commands: commandList
      };
    }
  });
}

/**
 * Create a tool to execute a specific JupyterLab command.
 * Commands in the settings' commandsRequiringApproval list will need approval.
 */
export function createExecuteCommandTool(
  commands: CommandRegistry,
  settingsModel: AISettingsModel
): ITool {
  return tool({
    title: 'Execute Command',
    description:
      'Execute a specific JupyterLab command with optional arguments',
    inputSchema: z.object({
      commandId: z.string().describe('The ID of the command to execute'),
      args: z
        .any()
        .optional()
        .describe('Optional arguments to pass to the command')
    }),
    needsApproval: (input: { commandId: string; args?: any }) => {
      const commandsRequiringApproval =
        settingsModel.config.commandsRequiringApproval || [];
      return commandsRequiringApproval.includes(input.commandId);
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
    }
  });
}
