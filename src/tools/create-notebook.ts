import { StructuredToolInterface, tool } from '@langchain/core/tools';
import { CommandRegistry } from '@lumino/commands';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { z } from 'zod';

export const createNotebook = (
  commands: CommandRegistry
): StructuredToolInterface => {
  return tool(
    async ({ command, args }) => {
      let result: any = 'No command called';
      if (command === 'notebook:create-new') {
        result = await commands.execute(
          command,
          args as ReadonlyPartialJSONObject
        );
      }
      const output = `
The test tool has been called, with the following query: "${command}"
The args for the commands where ${JSON.stringify(args)}
The result of the command (if called) is "${result}"
`;
      return output;
    },
    {
      name: 'createNotebook',
      description: 'Run jupyterlab command to create a notebook',
      schema: z.object({
        command: z.string().describe('The Jupyterlab command id to execute'),
        args: z
          .object({})
          .passthrough()
          .describe('The argument for the command')
      })
    }
  );
};
