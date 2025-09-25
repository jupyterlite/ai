import { CodeCell, ICodeCellModel, MarkdownCell } from '@jupyterlab/cells';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentWidget } from '@jupyterlab/docregistry';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { KernelSpec } from '@jupyterlab/services';
import { CommandRegistry } from '@lumino/commands';

import { tool } from '@openai/agents';

import { z } from 'zod';

import { ITool } from '../tokens';

/**
 * Find a kernel name that matches the specified language
 */
async function findKernelByLanguage(
  kernelSpecManager: KernelSpec.IManager,
  language?: string | null
): Promise<string> {
  try {
    await kernelSpecManager.ready;
    const specs = kernelSpecManager.specs;

    if (!specs || !specs.kernelspecs) {
      return 'python3'; // Final fallback
    }

    // If no language specified, return the default kernel
    if (!language) {
      return specs.default || Object.keys(specs.kernelspecs)[0] || 'python3';
    }

    // Normalize the language name for comparison
    const normalizedLanguage = language.toLowerCase().trim();

    // Find kernels that match the requested language
    for (const [kernelName, kernelSpec] of Object.entries(specs.kernelspecs)) {
      if (!kernelSpec) {
        continue;
      }

      const kernelLanguage = kernelSpec.language?.toLowerCase() || '';

      // Direct language match
      if (kernelLanguage === normalizedLanguage) {
        return kernelName;
      }
    }

    // No matching kernel found, return default
    console.warn(`No kernel found for language '${language}', using default`);
    return specs.default || Object.keys(specs.kernelspecs)[0] || 'python3';
  } catch (error) {
    console.warn('Failed to find kernel by language:', error);
    return 'python3';
  }
}

/**
 * Helper function to get a notebook widget by path or use the active one
 */
async function getNotebookWidget(
  notebookPath: string | null | undefined,
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): Promise<NotebookPanel | null> {
  if (notebookPath) {
    // Open specific notebook by path using document manager

    let widget = docManager.findWidget(notebookPath);
    if (!widget) {
      widget = docManager.openOrReveal(notebookPath);
    }

    if (!(widget instanceof NotebookPanel)) {
      throw new Error(`Widget for ${notebookPath} is not a notebook panel`);
    }

    return widget ?? null;
  } else {
    // Use current active notebook
    return notebookTracker?.currentWidget || null;
  }
}

/**
 * Create a notebook creation tool
 */
export function createNotebookCreationTool(
  docManager: IDocumentManager,
  kernelSpecManager: KernelSpec.IManager
): ITool {
  return tool({
    name: 'create_notebook',
    description:
      'Create a new Jupyter notebook with a kernel for the specified programming language',
    parameters: z.object({
      language: z
        .string()
        .optional()
        .nullable()
        .describe(
          'The programming language for the notebook (e.g., python, r, julia, javascript, etc.). Will use system default if not specified.'
        ),
      name: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Optional name for the notebook file (without .ipynb extension)'
        )
    }),
    execute: async (input: {
      language?: string | null;
      name?: string | null;
    }) => {
      const kernel = await findKernelByLanguage(
        kernelSpecManager,
        input.language
      );
      const { name } = input;

      if (!name) {
        throw new Error('A name must be provided to create a notebook');
      }

      try {
        // TODO: handle cwd / path?
        const fileName = name.endsWith('.ipynb') ? name : `${name}.ipynb`;

        // Create untitled notebook first
        const notebookModel = await docManager.newUntitled({
          type: 'notebook'
        });

        // Rename to desired filename
        await docManager.services.contents.rename(notebookModel.path, fileName);

        // Create widget with specific kernel
        const notebook = docManager.createNew(fileName, 'default', {
          name: kernel
        });

        if (!(notebook instanceof DocumentWidget)) {
          throw new Error('Failed to create notebook widget');
        }

        await notebook.context.ready;
        await notebook.context.save();

        docManager.openOrReveal(fileName);

        return {
          success: true,
          message: `Successfully created notebook ${fileName} with ${kernel} kernel${input.language ? ` for ${input.language}` : ''}`,
          notebookPath: fileName,
          notebookName: fileName,
          kernel,
          language: input.language
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to create notebook: ${(error as Error).message}`
        };
      }
    }
  });
}

/**
 * Create a tool for adding cells to a specific notebook
 */
export function createAddCellTool(
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'add_cell',
    description: 'Add a cell to the current notebook with optional content',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        ),
      content: z
        .string()
        .optional()
        .nullable()
        .describe('Content to add to the cell'),
      cellType: z
        .enum(['code', 'markdown', 'raw'])
        .default('code')
        .describe('Type of cell to add'),
      position: z
        .enum(['above', 'below'])
        .default('below')
        .describe('Position relative to current cell')
    }),
    async execute({
      notebookPath,
      content,
      cellType = 'code',
      position = 'below'
    }) {
      try {
        const currentWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!currentWidget) {
          return {
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          };
        }

        const notebook = currentWidget.content;
        const model = notebook.model;

        if (!model) {
          return {
            success: false,
            error: 'No notebook model available'
          };
        }

        // Check if we should replace the first empty cell instead of adding
        const shouldReplaceFirstCell =
          model.cells.length === 1 &&
          model.cells.get(0).sharedModel.getSource().trim() === '';

        if (shouldReplaceFirstCell) {
          // Replace the first empty cell by removing it and adding new one
          model.sharedModel.deleteCell(0);
        }

        // Create the new cell using shared model
        const newCellData = {
          cell_type: cellType,
          source: content || '',
          metadata: cellType === 'code' ? { trusted: true } : {}
        };

        model.sharedModel.addCell(newCellData);

        // Execute markdown cells after creation to render them
        if (cellType === 'markdown' && content) {
          const cellIndex = model.cells.length - 1;
          const cellWidget = notebook.widgets[cellIndex];
          if (cellWidget && cellWidget instanceof MarkdownCell) {
            try {
              await cellWidget.ready;
              cellWidget.rendered = true;
            } catch (error) {
              console.warn('Failed to render markdown cell:', error);
            }
          }
        }

        return {
          success: true,
          message: `${cellType} cell added successfully`,
          content: content || '',
          cellType,
          position
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to add ${cellType} cell: ${(error as Error).message}`
        };
      }
    }
  });
}

/**
 * Create a tool for getting notebook information
 */
export function createGetNotebookInfoTool(
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'get_notebook_info',
    description:
      'Get information about a notebook including number of cells and active cell index',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        )
    }),
    execute: async (input: { notebookPath?: string | null }) => {
      const { notebookPath } = input;

      try {
        const currentWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!currentWidget) {
          return JSON.stringify({
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          });
        }

        const notebook = currentWidget.content;
        const model = notebook.model;

        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'No notebook model available'
          });
        }

        const cellCount = model.cells.length;
        const activeCellIndex = notebook.activeCellIndex;
        const activeCell = notebook.activeCell;
        const activeCellType = activeCell?.model.type || 'unknown';

        return JSON.stringify({
          success: true,
          notebookName: currentWidget.title.label,
          notebookPath: currentWidget.context.path,
          cellCount,
          activeCellIndex,
          activeCellType,
          isDirty: model.dirty
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to get notebook info: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for getting cell information by index
 */
export function createGetCellInfoTool(
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'get_cell_info',
    description:
      'Get information about a specific cell including its type, source content, and outputs',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        ),
      cellIndex: z
        .number()
        .optional()
        .nullable()
        .describe(
          'Index of the cell to get information for (0-based). If not provided, uses the currently active cell'
        )
    }),
    execute: async (input: {
      notebookPath?: string | null;
      cellIndex?: number | null;
    }) => {
      const { notebookPath } = input;
      let { cellIndex } = input;
      try {
        const currentWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!currentWidget) {
          return JSON.stringify({
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          });
        }

        const notebook = currentWidget.content;
        const model = notebook.model;

        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'No notebook model available'
          });
        }

        if (cellIndex === undefined || cellIndex === null) {
          cellIndex = notebook.activeCellIndex;
        }

        if (cellIndex < 0 || cellIndex >= model.cells.length) {
          return JSON.stringify({
            success: false,
            error: `Invalid cell index: ${cellIndex}. Notebook has ${model.cells.length} cells.`
          });
        }

        const cell = model.cells.get(cellIndex);
        const cellType = cell.type;
        const sharedModel = cell.sharedModel;
        const source = sharedModel.getSource();

        // Get outputs for code cells
        let outputs: any[] = [];
        if (cellType === 'code') {
          const rawOutputs = sharedModel.toJSON().outputs;
          outputs = Array.isArray(rawOutputs) ? rawOutputs : [];
        }

        return JSON.stringify({
          success: true,
          cellId: cell.id,
          cellIndex,
          cellType,
          source,
          outputs,
          executionCount:
            cellType === 'code' ? (cell as any).executionCount : null
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to get cell info: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for setting cell content and type
 */
export function createSetCellContentTool(
  docManager: IDocumentManager,
  commands: CommandRegistry,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'set_cell_content',
    description:
      'Set the content of a specific cell and return both the previous and new content',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        ),
      cellId: z
        .string()
        .optional()
        .nullable()
        .describe(
          'ID of the cell to modify. If provided, takes precedence over cellIndex'
        ),
      cellIndex: z
        .number()
        .optional()
        .nullable()
        .describe(
          'Index of the cell to modify (0-based). Used if cellId is not provided. If neither is provided, targets the active cell'
        ),
      content: z.string().describe('New content for the cell')
    }),
    execute: async (input: {
      notebookPath?: string | null;
      cellId?: string | null;
      cellIndex?: number | null;
      content: string;
    }) => {
      const { notebookPath, cellId, cellIndex, content } = input;

      try {
        const notebookWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!notebookWidget) {
          return JSON.stringify({
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          });
        }

        const notebook = notebookWidget.content;
        const targetNotebookPath = notebookWidget.context.path;

        const model = notebook.model;

        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'No notebook model available'
          });
        }

        // Determine target cell index
        let targetCellIndex: number;
        if (cellId !== undefined && cellId !== null) {
          // Find cell by ID
          targetCellIndex = -1;
          for (let i = 0; i < model.cells.length; i++) {
            if (model.cells.get(i).id === cellId) {
              targetCellIndex = i;
              break;
            }
          }
          if (targetCellIndex === -1) {
            return JSON.stringify({
              success: false,
              error: `Cell with ID '${cellId}' not found in notebook`
            });
          }
        } else if (cellIndex !== undefined && cellIndex !== null) {
          // Use provided cell index
          if (cellIndex < 0 || cellIndex >= model.cells.length) {
            return JSON.stringify({
              success: false,
              error: `Invalid cell index: ${cellIndex}. Notebook has ${model.cells.length} cells.`
            });
          }
          targetCellIndex = cellIndex;
        } else {
          // Use active cell
          targetCellIndex = notebook.activeCellIndex;
          if (targetCellIndex === -1 || targetCellIndex >= model.cells.length) {
            return JSON.stringify({
              success: false,
              error: 'No active cell or invalid active cell index'
            });
          }
        }

        // Get the target cell
        const targetCell = model.cells.get(targetCellIndex);
        if (!targetCell) {
          return JSON.stringify({
            success: false,
            error: `Cell at index ${targetCellIndex} not found`
          });
        }

        const sharedModel = targetCell.sharedModel;

        // Get previous content and type
        const previousContent = sharedModel.getSource();
        const previousCellType = targetCell.type;
        const retrievedCellId = targetCell.id;

        sharedModel.setSource(content);

        // Show the cell diff using jupyterlab-cell-diff if available
        const showDiffCommandId = 'jupyterlab-cell-diff:show-codemirror';
        void commands.execute(showDiffCommandId, {
          originalSource: previousContent,
          newSource: content,
          cellId: retrievedCellId,
          showActionButtons: true,
          openDiff: true,
          notebookPath: targetNotebookPath
        });

        return JSON.stringify({
          success: true,
          message:
            cellId !== undefined && cellId !== null
              ? `Cell with ID '${cellId}' content replaced successfully`
              : cellIndex !== undefined && cellIndex !== null
                ? `Cell ${targetCellIndex} content replaced successfully`
                : 'Active cell content replaced successfully',
          notebookPath: targetNotebookPath,
          cellId: retrievedCellId,
          cellIndex: targetCellIndex,
          previousContent,
          previousCellType,
          newContent: content,
          wasActiveCell: cellId === undefined && cellIndex === undefined
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to replace cell content: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for running a specific cell
 */
export function createRunCellTool(
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'run_cell',
    description: 'Run a specific cell in the notebook by index',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        ),
      cellIndex: z.number().describe('Index of the cell to run (0-based)'),
      recordTiming: z
        .boolean()
        .default(true)
        .describe('Whether to record execution timing')
    }),
    needsApproval: true,
    execute: async (input: {
      notebookPath?: string | null;
      cellIndex: number;
      recordTiming?: boolean;
    }) => {
      const { notebookPath, cellIndex, recordTiming = true } = input;

      try {
        const currentWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!currentWidget) {
          return JSON.stringify({
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          });
        }

        const notebook = currentWidget.content;
        const model = notebook.model;

        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'No notebook model available'
          });
        }

        if (cellIndex < 0 || cellIndex >= model.cells.length) {
          return JSON.stringify({
            success: false,
            error: `Invalid cell index: ${cellIndex}. Notebook has ${model.cells.length} cells.`
          });
        }

        // Get the target cell widget
        const cellWidget = notebook.widgets[cellIndex];
        if (!cellWidget) {
          return JSON.stringify({
            success: false,
            error: `Cell widget at index ${cellIndex} not found`
          });
        }

        // Execute using shared model approach (non-disruptive)
        try {
          if (cellWidget instanceof CodeCell) {
            // Use direct CodeCell.execute() method
            const sessionCtx = currentWidget.sessionContext;
            await CodeCell.execute(cellWidget, sessionCtx, {
              recordTiming,
              deletedCells: model.deletedCells
            });

            const codeModel = cellWidget.model as ICodeCellModel;
            return JSON.stringify({
              success: true,
              message: `Cell ${cellIndex} executed successfully`,
              cellIndex,
              executionCount: codeModel.executionCount,
              hasOutput: codeModel.outputs.length > 0
            });
          } else {
            // For non-code cells, just return success
            return JSON.stringify({
              success: true,
              message: `Cell ${cellIndex} is not a code cell, no execution needed`,
              cellIndex,
              cellType: cellWidget.model.type
            });
          }
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: `Failed to execute cell: ${(error as Error).message}`,
            cellIndex
          });
        }
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to run cell: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for deleting a specific cell
 */
export function createDeleteCellTool(
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'delete_cell',
    description: 'Delete a specific cell from the notebook by index',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        ),
      cellIndex: z.number().describe('Index of the cell to delete (0-based)')
    }),
    execute: async (input: {
      notebookPath?: string | null;
      cellIndex: number;
    }) => {
      const { notebookPath, cellIndex } = input;

      try {
        const currentWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!currentWidget) {
          return JSON.stringify({
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          });
        }

        const notebook = currentWidget.content;
        const model = notebook.model;

        if (!model) {
          return JSON.stringify({
            success: false,
            error: 'No notebook model available'
          });
        }

        if (cellIndex < 0 || cellIndex >= model.cells.length) {
          return JSON.stringify({
            success: false,
            error: `Invalid cell index: ${cellIndex}. Notebook has ${model.cells.length} cells.`
          });
        }

        // Validate cell exists
        const targetCell = model.cells.get(cellIndex);
        if (!targetCell) {
          return JSON.stringify({
            success: false,
            error: `Cell at index ${cellIndex} not found`
          });
        }

        // Delete cell using shared model (non-disruptive)
        model.sharedModel.deleteCell(cellIndex);

        return JSON.stringify({
          success: true,
          message: `Cell ${cellIndex} deleted successfully`,
          cellIndex,
          remainingCells: model.cells.length
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to delete cell: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for executing code in the active cell (non-disruptive alternative to mcp__ide__executeCode)
 */
export function createExecuteActiveCellTool(
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'execute_active_cell',
    description:
      'Execute the currently active cell in the notebook without disrupting user focus',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        ),
      code: z
        .string()
        .optional()
        .nullable()
        .describe('Optional: set cell content before executing'),
      recordTiming: z
        .boolean()
        .default(true)
        .describe('Whether to record execution timing')
    }),
    execute: async (input: {
      notebookPath?: string | null;
      code?: string | null;
      recordTiming?: boolean;
    }) => {
      const { notebookPath, code, recordTiming = true } = input;

      try {
        const currentWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!currentWidget) {
          return JSON.stringify({
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          });
        }

        const notebook = currentWidget.content;
        const model = notebook.model;
        const activeCellIndex = notebook.activeCellIndex;

        if (!model || activeCellIndex === -1) {
          return JSON.stringify({
            success: false,
            error: 'No notebook model or active cell available'
          });
        }

        const activeCell = model.cells.get(activeCellIndex);
        if (!activeCell) {
          return JSON.stringify({
            success: false,
            error: 'Active cell not found'
          });
        }

        // Set code content if provided
        if (code) {
          activeCell.sharedModel.setSource(code);
        }

        // Get the cell widget for execution
        const cellWidget = notebook.widgets[activeCellIndex];
        if (!cellWidget || !(cellWidget instanceof CodeCell)) {
          return JSON.stringify({
            success: false,
            error: 'Active cell is not a code cell'
          });
        }

        // Execute using shared model approach (non-disruptive)
        const sessionCtx = currentWidget.sessionContext;
        await CodeCell.execute(cellWidget, sessionCtx, {
          recordTiming,
          deletedCells: model.deletedCells
        });

        const codeModel = cellWidget.model as ICodeCellModel;
        return JSON.stringify({
          success: true,
          message: 'Code executed successfully in active cell',
          cellIndex: activeCellIndex,
          executionCount: codeModel.executionCount,
          hasOutput: codeModel.outputs.length > 0,
          code: code || activeCell.sharedModel.getSource()
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to execute code: ${(error as Error).message}`
        });
      }
    }
  });
}

/**
 * Create a tool for saving a specific notebook
 */
export function createSaveNotebookTool(
  docManager: IDocumentManager,
  notebookTracker?: INotebookTracker
): ITool {
  return tool({
    name: 'save_notebook',
    description: 'Save a specific notebook to disk',
    parameters: z.object({
      notebookPath: z
        .string()
        .optional()
        .nullable()
        .describe(
          'Path to the notebook file. If not provided, uses the currently active notebook'
        )
    }),
    execute: async (input: { notebookPath?: string | null }) => {
      const { notebookPath } = input;

      try {
        const currentWidget = await getNotebookWidget(
          notebookPath,
          docManager,
          notebookTracker
        );
        if (!currentWidget) {
          return JSON.stringify({
            success: false,
            error: notebookPath
              ? `Failed to open notebook at path: ${notebookPath}`
              : 'No active notebook and no notebook path provided'
          });
        }

        await currentWidget.context.save();

        return JSON.stringify({
          success: true,
          message: 'Notebook saved successfully',
          notebookName: currentWidget.title.label,
          notebookPath: currentWidget.context.path
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to save notebook: ${(error as Error).message}`
        });
      }
    }
  });
}
