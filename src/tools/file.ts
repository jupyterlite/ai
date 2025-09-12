import { CommandRegistry } from '@lumino/commands';
import { IDocumentManager } from '@jupyterlab/docmanager';

import { tool } from '@openai/agents';

import { z } from 'zod';

import { ITool } from '../tokens';

/**
 * Create a tool for creating new files of various types
 */
export function createNewFileTool(docManager: IDocumentManager): ITool {
  return tool({
    name: 'create_file',
    description:
      'Create a new file of specified type (text, python, markdown, json, etc.)',
    parameters: z.object({
      fileName: z.string().describe('Name of the file to create'),
      fileType: z
        .enum([
          'text',
          'python',
          'markdown',
          'json',
          'javascript',
          'typescript'
        ])
        .default('text')
        .describe('Type of file to create'),
      content: z
        .string()
        .optional()
        .nullable()
        .describe('Initial content for the file (optional)'),
      cwd: z
        .string()
        .optional()
        .nullable()
        .describe('Directory where to create the file (optional)')
    }),
    execute: async (input: {
      fileName: string;
      fileType?:
        | 'text'
        | 'python'
        | 'markdown'
        | 'json'
        | 'javascript'
        | 'typescript';
      content?: string | null;
      cwd?: string | null;
    }) => {
      const { fileName, content = '', cwd, fileType = 'text' } = input;

      try {
        // Determine file extension based on type
        const extensions: Record<string, string> = {
          python: 'py',
          markdown: 'md',
          json: 'json',
          text: 'txt',
          javascript: 'js',
          typescript: 'ts'
        };

        const ext = extensions[fileType] || 'txt';

        // If fileName already has an extension, use it as-is, otherwise add the extension
        const fullFileName = fileName.includes('.')
          ? fileName
          : `${fileName}.${ext}`;

        // For Python files, ensure .py extension if fileType is python
        const finalFileName =
          fileType === 'python' &&
          !fileName.endsWith('.py') &&
          !fileName.includes('.')
            ? `${fileName}.py`
            : fullFileName;

        const fullPath = cwd ? `${cwd}/${finalFileName}` : finalFileName;

        // Create file with content using document manager
        const model = await docManager.services.contents.newUntitled({
          path: cwd || '',
          type: 'file',
          ext
        });

        // Rename to desired name if needed
        let finalPath = model.path;
        if (model.name !== finalFileName) {
          const renamed = await docManager.services.contents.rename(
            model.path,
            fullPath
          );
          finalPath = renamed.path;
        }

        // Set content if provided
        if (content) {
          await docManager.services.contents.save(finalPath, {
            type: 'file',
            format: 'text',
            content
          });
        }

        // Open the newly created file
        let opened = false;
        if (!docManager.findWidget(finalPath)) {
          docManager.openOrReveal(finalPath);
          opened = true;
        }

        return {
          success: true,
          message: `${fileType} file '${finalFileName}' created and opened successfully`,
          fileName: finalFileName,
          filePath: finalPath,
          fileType,
          hasContent: !!content,
          opened
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to create file: ${(error as Error).message}`
        };
      }
    }
  });
}

/**
 * Create a tool for opening files
 */
export function createOpenFileTool(docManager: IDocumentManager): ITool {
  return tool({
    name: 'open_file',
    description: 'Open a file in the editor',
    parameters: z.object({
      filePath: z.string().describe('Path to the file to open')
    }),
    execute: async (input: { filePath: string }) => {
      const { filePath } = input;

      try {
        const widget = docManager.openOrReveal(filePath);

        if (!widget) {
          return {
            success: false,
            error: `Failed to open file: ${filePath}`
          };
        }

        return {
          success: true,
          message: `File '${filePath}' opened successfully`,
          filePath,
          widgetId: widget.id
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to open file: ${(error as Error).message}`
        };
      }
    }
  });
}

/**
 * Create a tool for deleting files
 */
export function createDeleteFileTool(docManager: IDocumentManager): ITool {
  return tool({
    name: 'delete_file',
    description: 'Delete a file from the file system',
    parameters: z.object({
      filePath: z.string().describe('Path to the file to delete')
    }),
    execute: async (input: { filePath: string }) => {
      const { filePath } = input;

      try {
        await docManager.services.contents.delete(filePath);

        return {
          success: true,
          message: `File '${filePath}' deleted successfully`,
          filePath
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to delete file: ${(error as Error).message}`
        };
      }
    }
  });
}

/**
 * Create a tool for renaming files
 */
export function createRenameFileTool(docManager: IDocumentManager): ITool {
  return tool({
    name: 'rename_file',
    description: 'Rename a file or move it to a different location',
    parameters: z.object({
      oldPath: z.string().describe('Current path of the file'),
      newPath: z.string().describe('New path/name for the file')
    }),
    execute: async (input: { oldPath: string; newPath: string }) => {
      const { oldPath, newPath } = input;

      try {
        await docManager.services.contents.rename(oldPath, newPath);

        return {
          success: true,
          message: `File renamed from '${oldPath}' to '${newPath}' successfully`,
          oldPath,
          newPath
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to rename file: ${(error as Error).message}`
        };
      }
    }
  });
}

/**
 * Create a tool for copying files
 */
export function createCopyFileTool(docManager: IDocumentManager): ITool {
  return tool({
    name: 'copy_file',
    description: 'Copy a file to a new location',
    parameters: z.object({
      sourcePath: z.string().describe('Path of the file to copy'),
      destinationPath: z
        .string()
        .describe('Destination path for the copied file')
    }),
    execute: async (input: { sourcePath: string; destinationPath: string }) => {
      const { sourcePath, destinationPath } = input;

      try {
        await docManager.services.contents.copy(sourcePath, destinationPath);

        return {
          success: true,
          message: `File copied from '${sourcePath}' to '${destinationPath}' successfully`,
          sourcePath,
          destinationPath
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to copy file: ${(error as Error).message}`
        };
      }
    }
  });
}

/**
 * Create a tool for navigating to directories in the file browser
 */
export function createNavigateToDirectoryTool(
  commands: CommandRegistry
): ITool {
  return tool({
    name: 'navigate_to_directory',
    description: 'Navigate to a specific directory in the file browser',
    parameters: z.object({
      directoryPath: z.string().describe('Path to the directory to navigate to')
    }),
    execute: async (input: { directoryPath: string }) => {
      const { directoryPath } = input;

      try {
        await commands.execute('filebrowser:go-to-path', {
          path: directoryPath
        });

        return {
          success: true,
          message: `Navigated to directory '${directoryPath}' successfully`,
          directoryPath
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to navigate to directory: ${(error as Error).message}`
        };
      }
    }
  });
}
