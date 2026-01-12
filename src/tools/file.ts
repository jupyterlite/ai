import { PathExt } from '@jupyterlab/coreutils';
import { CommandRegistry } from '@lumino/commands';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { IEditorTracker } from '@jupyterlab/fileeditor';

import { tool } from 'ai';

import { z } from 'zod';

import { IDiffManager, ITool } from '../tokens';

/**
 * Create a tool for creating new files of various types
 */
export function createNewFileTool(docManager: IDocumentManager): ITool {
  return tool({
    title: 'New File',
    description:
      'Create a new file of specified type (text, python, markdown, json, etc.)',
    inputSchema: z.object({
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
    execute: async (input: {
      fileName: string;
      fileType?: string;
      content?: string | null;
      cwd?: string | null;
    }) => {
      const { fileName, content = '', cwd, fileType = 'text' } = input;

      const registeredFileType = docManager.registry.getFileType(fileType);
      const ext = registeredFileType?.extensions[0] || '.txt';

      const existingExt = PathExt.extname(fileName);
      const fullFileName = existingExt ? fileName : `${fileName}${ext}`;

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
    title: 'Open File',
    description: 'Open a file in the editor',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file to open')
    }),
    execute: async (input: { filePath: string }) => {
      const { filePath } = input;

      const widget = docManager.openOrReveal(filePath);

      if (!widget) {
        return {
          success: false,
          error: `Could not open file: ${filePath}`
        };
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
    title: 'Delete File',
    description: 'Delete a file from the file system',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file to delete')
    }),
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
    title: 'Rename File',
    description: 'Rename a file or move it to a different location',
    inputSchema: z.object({
      oldPath: z.string().describe('Current path of the file'),
      newPath: z.string().describe('New path/name for the file')
    }),
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
    title: 'Copy File',
    description: 'Copy a file to a new location',
    inputSchema: z.object({
      sourcePath: z.string().describe('Path of the file to copy'),
      destinationPath: z
        .string()
        .describe('Destination path for the copied file')
    }),
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
    title: 'Navigate to Directory',
    description: 'Navigate to a specific directory in the file browser',
    inputSchema: z.object({
      directoryPath: z.string().describe('Path to the directory to navigate to')
    }),
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
 * Create a tool for getting file information and content
 */
export function createGetFileInfoTool(
  docManager: IDocumentManager,
  editorTracker?: IEditorTracker
): ITool {
  return tool({
    title: 'Get File Info',
    description:
      'Get information about a file including its path, name, extension, and content. Works with text-based files like Python files, markdown, JSON, etc. For Jupyter notebooks, use dedicated notebook tools instead. If no file path is provided, returns information about the currently active file in the editor.',
    inputSchema: z.object({
      filePath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the file to read (e.g., "script.py", "README.md", "config.json"). If not provided, uses the currently active file in the editor.'
        )
    }),
    execute: async (input: { filePath?: string | null }) => {
      const { filePath } = input;

      let widget: IDocumentWidget | null = null;

      if (filePath) {
        widget =
          docManager.findWidget(filePath) ??
          docManager.openOrReveal(filePath) ??
          null;

        if (!widget) {
          return JSON.stringify({
            success: false,
            error: `Failed to open file at path: ${filePath}`
          });
        }
      } else {
        widget = editorTracker?.currentWidget ?? null;

        if (!widget) {
          return JSON.stringify({
            success: false,
            error: 'No active file in the editor and no file path provided'
          });
        }
      }

      if (!widget.context) {
        return JSON.stringify({
          success: false,
          error: 'Widget is not a document'
        });
      }

      await widget.context.ready;

      const model = widget.context.model;

      if (!model) {
        return JSON.stringify({
          success: false,
          error: 'File model not available'
        });
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

/**
 * Create a tool for setting the content of a file
 */
export function createSetFileContentTool(
  docManager: IDocumentManager,
  diffManager?: IDiffManager
): ITool {
  return tool({
    title: 'Set File Content',
    description:
      'Set or update the content of an existing file. This will replace the entire content of the file. For Jupyter notebooks, use dedicated notebook tools instead.',
    inputSchema: z.object({
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
        return JSON.stringify({
          success: false,
          error: `Failed to open file at path: ${filePath}`
        });
      }

      await widget.context.ready;

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

      const sharedModel = model.sharedModel;
      const originalContent = sharedModel.getSource();

      sharedModel.setSource(content);

      // Show the file diff using the diff manager if available
      if (diffManager) {
        await diffManager.showFileDiff({
          original: String(originalContent),
          modified: content,
          filePath
        });
      }

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
