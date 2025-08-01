import { StructuredToolInterface, tool } from '@langchain/core/tools';
import { CommandRegistry } from '@lumino/commands';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { z } from 'zod';

const NOTEBOOK_COMMANDS = [
  'notebook:create-new',
  'notebook:replace-selection',
  'notebook:change-cell-to-code',
  'notebook:change-cell-to-markdown',
  'notebook:change-cell-to-raw',
  'notebook:insert-cell-above',
  'notebook:insert-cell-below',
  'notebook:run-cell',
  'notebook:run-cell-and-select-next',
  'notebook:enter-edit-mode',
  'notebook:enter-command-mode',
  'notebook:replace-selection'
];

const DEFAULT_ARGS: { [command: string]: any } = {
  'notebook:create-new': {
    kernelId: 'python3'
  }
};

export const notebook = (
  commands: CommandRegistry
): StructuredToolInterface => {
  return tool(
    async ({ command, args }) => {
      // Set default args if not provided.
      if (DEFAULT_ARGS[command] !== undefined) {
        Object.entries(DEFAULT_ARGS[command]).forEach(([key, value]) => {
          if (!args[key]) {
            args[key] = value;
          }
        });
      }
      const result = await commands.execute(
        command,
        args as ReadonlyPartialJSONObject
      );
      const output: any = {
        command,
        args
      };
      if (result !== undefined) {
        try {
          JSON.stringify(result, undefined, 2);
          output.result = result;
        } catch {
          output.result = 'Output is not serializable';
        }
      }
      return JSON.stringify(output, undefined, 2);
    },
    {
      name: 'notebook',
      description: `
Run jupyterlab command to work on notebook, using relevant args if necessary.
The commands available are:
- ${NOTEBOOK_COMMANDS.join('\n- ')}
`,
      schema: z.object({
        command: z.string().describe('The Jupyterlab command id to execute'),
        args: z
          .object({})
          .passthrough()
          .describe('The arguments for the command')
      })
    }
  );
};
