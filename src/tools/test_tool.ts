import { showDialog } from '@jupyterlab/apputils';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const testTool = tool(
  async ({ query }) => {
    console.log('QUERY', query);
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
