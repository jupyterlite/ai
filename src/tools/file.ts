import { CommandRegistry } from '@lumino/commands';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { IEditorTracker } from '@jupyterlab/fileeditor';

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

/**
 * Create a tool for getting the content of a file
 */
export function createGetFileContentTool(docManager: IDocumentManager): ITool {
  return tool({
    name: 'get_file_content',
    description:
      'Get the content of a file by its path. Works with any text-based file including notebooks, Python files, markdown, etc.',
    parameters: z.object({
      filePath: z
        .string()
        .describe(
          'Path to the file to read (e.g., "notebook.ipynb", "script.py")'
        )
    }),
    execute: async (input: { filePath: string }) => {
      const { filePath } = input;

      try {
        // Try to find an already open widget
        let widget = docManager.findWidget(filePath);

        // If not found, open the file
        if (!widget) {
          widget = docManager.openOrReveal(filePath);
        }

        if (!widget) {
          return JSON.stringify({
            success: false,
            error: `Failed to open file at path: ${filePath}`
          });
        }

        // Wait for the context to be ready
        await widget.context.ready;

        // Get the content model
        const model = widget.context.model;

        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'File model not available'
          });
        }

        // Get the content using shared model
        const sharedModel = model.sharedModel;
        const content = sharedModel.getSource();

        return JSON.stringify({
          success: true,
          filePath,
          fileName: widget.title.label,
          content,
          isDirty: model.dirty,
          readOnly: model.readOnly
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to read file content: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for setting the content of a file
 */
export function createSetFileContentTool(
  docManager: IDocumentManager,
  commands: CommandRegistry
): ITool {
  return tool({
    name: 'set_file_content',
    description:
      'Set or update the content of an existing file. This will replace the entire content of the file.',
    parameters: z.object({
      filePath: z
        .string()
        .describe(
          'Path to the file to update (e.g., "notebook.ipynb", "script.py")'
        ),
      content: z.string().describe('The new content to set for the file'),
      save: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to save the file after updating (default: true)')
    }),
    execute: async (input: {
      filePath: string;
      content: string;
      save?: boolean;
    }) => {
      const { filePath, content, save = true } = input;

      try {
        // Try to find an already open widget
        let widget = docManager.findWidget(filePath);

        // If not found, open the file
        if (!widget) {
          widget = docManager.openOrReveal(filePath);
        }

        if (!widget) {
          return JSON.stringify({
            success: false,
            error: `Failed to open file at path: ${filePath}`
          });
        }

        // Wait for the context to be ready
        await widget.context.ready;

        // Get the content model
        const model = widget.context.model;

        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'File model not available'
          });
        }

        if (model.readOnly) {
          return JSON.stringify({
            success: false,
            error: 'File is read-only and cannot be modified'
          });
        }

        // Get the original content before setting new content
        const sharedModel = model.sharedModel;
        const originalContent = sharedModel.getSource();

        // Set the new content using shared model
        sharedModel.setSource(content);

        // Show the diff using jupyterlab-cell-diff if available
        const diffCommandId = 'jupyterlab-cell-diff:diff-file';
        void commands.execute(diffCommandId, {
          filePath,
          originalSource: originalContent,
          newSource: content
        });

        // Save if requested
        if (save) {
          await widget.context.save();
        }

        return JSON.stringify({
          success: true,
          filePath,
          fileName: widget.title.label,
          contentLength: content.length,
          saved: save,
          isDirty: model.dirty
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to set file content: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for getting information about the currently active file
 */
export function createGetCurrentFileTool(editorTracker: IEditorTracker): ITool {
  return tool({
    name: 'get_current_file',
    description:
      'Get information about the currently active file in the editor, including its path, name, and content',
    parameters: z.object({}),
    execute: async () => {
      try {
        // Get the current widget from the editor tracker
        const currentWidget = editorTracker.currentWidget;

        if (!currentWidget) {
          return JSON.stringify({
            success: false,
            error: 'No active file or widget'
          });
        }

        // Check if it's a document widget with a context
        const docWidget = currentWidget as IDocumentWidget;
        if (!docWidget.context) {
          return JSON.stringify({
            success: false,
            error: 'Current widget is not a document'
          });
        }

        // Wait for context to be ready
        await docWidget.context.ready;

        const model = docWidget.context.model;
        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'Document model not available'
          });
        }

        // Get content using shared model
        const sharedModel = model.sharedModel;
        const content = sharedModel.getSource();
        const filePath = docWidget.context.path;
        const fileName = currentWidget.title.label;

        // Determine file type based on path extension
        const fileExtension = filePath.split('.').pop() || 'unknown';

        return JSON.stringify({
          success: true,
          filePath,
          fileName,
          fileExtension,
          content,
          isDirty: model.dirty,
          readOnly: model.readOnly,
          widgetType: currentWidget.constructor.name
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to get current file info: ${(error as Error).message}`
        });
      }
    }
  });
}
