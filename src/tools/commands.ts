import { CommandRegistry } from '@lumino/commands';
import { Widget } from '@lumino/widgets';
import { tool } from 'ai';
import { z } from 'zod';
import { ITool } from '../tokens';
import { AISettingsModel } from '../models/settings-model';

interface ICommandEntry {
  id: string;
  label?: string;
  caption?: string;
  description?: string;
  args?: any;
}

interface ISearchableField {
  value?: string;
  weight: number;
}

/**
 * Search commands using case-insensitive term matching across command metadata.
 *
 * Multi-word queries are split into individual terms, and every term must be
 * contained in at least one searchable field. Results are ranked by stronger
 * field matches while keeping a stable fallback order.
 */
function searchCommands(
  commands: ICommandEntry[],
  query: string
): ICommandEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return commands;
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return commands
    .map((command, index) => {
      const fields: ISearchableField[] = [
        { value: command.label, weight: 4 },
        { value: command.caption, weight: 3 },
        { value: command.id, weight: 2 },
        { value: command.description, weight: 1 }
      ];

      const normalizedFields = fields.map(field => ({
        normalizedValue: field.value?.toLowerCase() ?? '',
        weight: field.weight
      }));

      const matchesAllTerms = terms.every(term =>
        normalizedFields.some(field => field.normalizedValue.includes(term))
      );

      if (!matchesAllTerms) {
        return null;
      }

      const score = normalizedFields.reduce((total, field) => {
        if (!field.normalizedValue) {
          return total;
        }

        let fieldScore = 0;
        if (field.normalizedValue.includes(normalizedQuery)) {
          fieldScore += field.weight * 4;
        } else {
          fieldScore +=
            terms.filter(term => field.normalizedValue.includes(term)).length *
            field.weight;
        }

        return total + fieldScore;
      }, 0);

      return { command, index, score };
    })
    .filter(
      (
        result
      ): result is {
        command: ICommandEntry;
        index: number;
        score: number;
      } => result !== null
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.command);
}

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
        .describe(
          'Optional search query to filter commands. Supports multi-word queries (whitespace-separated) by requiring each word to be contained in the command id, label, caption, or description. Leave empty to list all commands.'
        )
    }),
    execute: async (input: { query?: string | null }) => {
      const { query } = input;

      // Build the full command list first.
      const commandIds = commands.listCommands();
      const allCommands: ICommandEntry[] = [];

      for (const id of commandIds) {
        const description = await commands.describedBy(id);
        const label = commands.label(id);
        const caption = commands.caption(id);
        const usage = commands.usage(id);

        allCommands.push({
          id,
          label: label || undefined,
          caption: caption || undefined,
          description: usage || undefined,
          args: description?.args || undefined
        });
      }

      const commandList = query
        ? searchCommands(allCommands, query)
        : allCommands;

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
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Optional arguments object to pass to the command (must be an object, not a string)'
        )
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

      // Handle actual Lumino widgets specially by extracting id and title.
      // Avoid collapsing plain command results that happen to contain an `id` field.
      let serializedResult;
      if (result instanceof Widget) {
        serializedResult = {
          id: result.id,
          title: result.title?.label || result.title
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
