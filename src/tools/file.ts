import { PathExt } from '@jupyterlab/coreutils';
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
        .string()
        .default('text')
        .describe(
          'Type of file to create. Common examples: text, python, markdown, json, javascript, typescript, yaml, julia, r, csv'
        ),
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
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to create file: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: {
      fileName: string;
      fileType?: string;
      content?: string | null;
      cwd?: string | null;
    }) => {
      const { fileName, content = '', cwd, fileType = 'text' } = input;

      const registeredFileType = docManager.registry.getFileType(fileType);
      const extWithDot = registeredFileType?.extensions[0] || '.txt';
      const ext = extWithDot.slice(1);

      const existingExt = PathExt.extname(fileName);
      const fullFileName = existingExt ? fileName : `${fileName}.${ext}`;

      const fullPath = cwd ? `${cwd}/${fullFileName}` : fullFileName;

      const model = await docManager.services.contents.newUntitled({
        path: cwd || '',
        type: 'file',
        ext
      });

      let finalPath = model.path;
      if (model.name !== fullFileName) {
        const renamed = await docManager.services.contents.rename(
          model.path,
          fullPath
        );
        finalPath = renamed.path;
      }

      if (content) {
        await docManager.services.contents.save(finalPath, {
          type: 'file',
          format: 'text',
          content
        });
      }

      let opened = false;
      if (!docManager.findWidget(finalPath)) {
        docManager.openOrReveal(finalPath);
        opened = true;
      }

      return {
        success: true,
        message: `${fileType} file '${fullFileName}' created and opened successfully`,
        fileName: fullFileName,
        filePath: finalPath,
        fileType,
        hasContent: !!content,
        opened
      };
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
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to open file: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: { filePath: string }) => {
      const { filePath } = input;

      const widget = docManager.openOrReveal(filePath);

      if (!widget) {
        throw new Error(`Could not open file: ${filePath}`);
      }

      return {
        success: true,
        message: `File '${filePath}' opened successfully`,
        filePath,
        widgetId: widget.id
      };
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
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: { filePath: string }) => {
      const { filePath } = input;

      await docManager.services.contents.delete(filePath);

      return {
        success: true,
        message: `File '${filePath}' deleted successfully`,
        filePath
      };
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
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to rename file: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: { oldPath: string; newPath: string }) => {
      const { oldPath, newPath } = input;

      await docManager.services.contents.rename(oldPath, newPath);

      return {
        success: true,
        message: `File renamed from '${oldPath}' to '${newPath}' successfully`,
        oldPath,
        newPath
      };
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
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to copy file: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: { sourcePath: string; destinationPath: string }) => {
      const { sourcePath, destinationPath } = input;

      await docManager.services.contents.copy(sourcePath, destinationPath);

      return {
        success: true,
        message: `File copied from '${sourcePath}' to '${destinationPath}' successfully`,
        sourcePath,
        destinationPath
      };
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
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to navigate to directory: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: { directoryPath: string }) => {
      const { directoryPath } = input;

      await commands.execute('filebrowser:go-to-path', {
        path: directoryPath
      });

      return {
        success: true,
        message: `Navigated to directory '${directoryPath}' successfully`,
        directoryPath
      };
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
      'Get the content of a file by its path. Works with text-based files like Python files, markdown, JSON, etc. For Jupyter notebooks, use dedicated notebook tools instead.',
    parameters: z.object({
      filePath: z
        .string()
        .describe(
          'Path to the file to read (e.g., "script.py", "README.md", "config.json")'
        )
    }),
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to read file content: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: { filePath: string }) => {
      const { filePath } = input;

      let widget = docManager.findWidget(filePath);

      if (!widget) {
        widget = docManager.openOrReveal(filePath);
      }

      if (!widget) {
        throw new Error(`Failed to open file at path: ${filePath}`);
      }

      await widget.context.ready;

      const model = widget.context.model;

      if (!model) {
        throw new Error('File model not available');
      }

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
      'Set or update the content of an existing file. This will replace the entire content of the file. For Jupyter notebooks, use dedicated notebook tools instead.',
    parameters: z.object({
      filePath: z
        .string()
        .describe(
          'Path to the file to update (e.g., "script.py", "README.md", "config.json")'
        ),
      content: z.string().describe('The new content to set for the file'),
      save: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to save the file after updating (default: true)')
    }),
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to set file content: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: {
      filePath: string;
      content: string;
      save?: boolean;
    }) => {
      const { filePath, content, save = true } = input;

      let widget = docManager.findWidget(filePath);

      if (!widget) {
        widget = docManager.openOrReveal(filePath);
      }

      if (!widget) {
        throw new Error(`Failed to open file at path: ${filePath}`);
      }

      await widget.context.ready;

      const model = widget.context.model;

      if (!model) {
        throw new Error('File model not available');
      }

      if (model.readOnly) {
        throw new Error('File is read-only and cannot be modified');
      }

      const sharedModel = model.sharedModel;
      const originalContent = sharedModel.getSource();

      sharedModel.setSource(content);

      const diffCommandId = 'jupyterlab-cell-diff:diff-file';
      void commands.execute(diffCommandId, {
        filePath,
        originalSource: originalContent,
        newSource: content
      });

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
    }
  });
}

/**
 * Create a tool for getting information about the currently active file
 */
export function createGetCurrentFileTool(
  docManager: IDocumentManager,
  editorTracker?: IEditorTracker
): ITool {
  return tool({
    name: 'get_current_file',
    description:
      'Get information about the currently active file in the editor, including its path, name, and content',
    parameters: z.object({
      filePath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the file. If not provided, uses the currently active file'
        )
    }),
    errorFunction: (context, error) => {
      return JSON.stringify({
        success: false,
        error: `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`
      });
    },
    execute: async (input: { filePath?: string | null }) => {
      const { filePath } = input;

      let widget: IDocumentWidget | null = null;

      if (filePath) {
        widget = docManager.findWidget(filePath) || null;

        if (!widget) {
          widget = docManager.openOrReveal(filePath) || null;
        }

        if (!widget) {
          throw new Error(`Failed to open file at path: ${filePath}`);
        }
      } else {
        const currentWidget = editorTracker?.currentWidget;

        if (!currentWidget) {
          throw new Error('No active file or widget and no file path provided');
        }

        widget = currentWidget as IDocumentWidget;
      }

      if (!widget.context) {
        throw new Error('Widget is not a document');
      }

      await widget.context.ready;

      const model = widget.context.model;
      if (!model) {
        throw new Error('Document model not available');
      }

      const sharedModel = model.sharedModel;
      const content = sharedModel.getSource();
      const resolvedFilePath = widget.context.path;
      const fileName = widget.title.label;

      const fileExtension = PathExt.extname(resolvedFilePath) || 'unknown';

      return JSON.stringify({
        success: true,
        filePath: resolvedFilePath,
        fileName,
        fileExtension,
        content,
        isDirty: model.dirty,
        readOnly: model.readOnly,
        widgetType: widget.constructor.name
      });
    }
  });
}
