import { showDialog } from '@jupyterlab/apputils';
import { StructuredToolInterface, tool } from '@langchain/core/tools';
import { z } from 'zod';

export const testTool: StructuredToolInterface = tool(
  async ({ query }) => {
    showDialog({ title: 'Answer', body: query });
    return 'The test tool has been called';
  },
  {
    name: 'testTool',
    description: 'Display a modal with the provider answer',
    schema: z.object({
      query: z.string().describe('The query to display')
    })
  }
);
