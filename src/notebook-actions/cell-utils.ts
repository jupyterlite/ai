/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import * as nbformat from '@jupyterlab/nbformat';

/**
 * Maximum number of characters to include from previous cells.
 */
const MAX_PREV_CHARS = 1500;

/**
 * Get the source code of the active cell in the current notebook.
 */
export function getActiveCellSource(
  notebookTracker: INotebookTracker
): string | null {
  const notebook = notebookTracker.currentWidget;
  if (!notebook) {
    return null;
  }
  const activeCell = notebook.content.activeCell;
  if (!activeCell) {
    return null;
  }
  return activeCell.model.sharedModel.source;
}

/**
 * Collect source from code cells preceding the active cell,
 * up to a character budget.
 */
export function getPreviousCellsSource(
  notebookTracker: INotebookTracker,
  maxChars: number = MAX_PREV_CHARS
): string {
  const notebook = notebookTracker.currentWidget;
  if (!notebook) {
    return '';
  }
  const cells = notebook.content.widgets;
  const activeCellIndex = notebook.content.activeCellIndex;

  const snippets: string[] = [];
  let totalChars = 0;

  // Walk backwards from the cell just above the active cell so the
  // most recent context is included first, then reverse at the end.
  for (let i = activeCellIndex - 1; i >= 0 && totalChars < maxChars; i--) {
    const cell = cells[i];
    if (cell.model.type !== 'code') {
      continue;
    }
    const source = cell.model.sharedModel.source.trim();
    if (!source) {
      continue;
    }
    if (totalChars + source.length > maxChars) {
      // Take a prefix that fits within the budget
      snippets.push(source.slice(0, maxChars - totalChars));
      break;
    }
    snippets.push(source);
    totalChars += source.length;
  }

  snippets.reverse();
  return snippets.join('\n\n');
}

/**
 * Retrieve the error / stderr output of the active cell.
 */
export function getActiveCellErrorOutput(
  notebookTracker: INotebookTracker
): string {
  const notebook = notebookTracker.currentWidget;
  if (!notebook) {
    return '';
  }
  const activeCell = notebook.content.activeCell;
  if (!activeCell) {
    return '';
  }

  const model = activeCell.model;
  if (model.type !== 'code') {
    return '';
  }

  const outputs = (model as any).outputs;
  if (!outputs) {
    return '';
  }

  const errorParts: string[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs.get(i) as nbformat.IOutput;
    if (output.output_type === 'error') {
      const err = output as nbformat.IError;
      errorParts.push(
        `${err.ename}: ${err.evalue}\n${(err.traceback ?? []).join('\n')}`
      );
    } else if (output.output_type === 'stream') {
      const stream = output as nbformat.IStream;
      if (stream.name === 'stderr') {
        const text = Array.isArray(stream.text)
          ? stream.text.join('')
          : stream.text;
        errorParts.push(text);
      }
    }
  }

  return errorParts.join('\n');
}

/**
 * Retrieve the stdout output of the active cell.
 */
export function getActiveCellStdout(notebookTracker: INotebookTracker): string {
  const notebook = notebookTracker.currentWidget;
  if (!notebook) {
    return '';
  }
  const activeCell = notebook.content.activeCell;
  if (!activeCell) {
    return '';
  }

  const model = activeCell.model;
  if (model.type !== 'code') {
    return '';
  }

  const outputs = (model as any).outputs;
  if (!outputs) {
    return '';
  }

  const stdoutParts: string[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs.get(i) as nbformat.IOutput;
    if (output.output_type === 'stream') {
      const stream = output as nbformat.IStream;
      if (stream.name === 'stdout') {
        const text = Array.isArray(stream.text)
          ? stream.text.join('')
          : stream.text;
        stdoutParts.push(text);
      }
    } else if (output.output_type === 'execute_result') {
      const result = output as nbformat.IExecuteResult;
      const textData = result.data?.['text/plain'];
      if (textData) {
        const text = Array.isArray(textData)
          ? (textData as string[]).join('')
          : String(textData);
        stdoutParts.push(text);
      }
    }
  }

  return stdoutParts.join('\n');
}

/**
 * Replace the source of the active cell.
 */
export function setActiveCellSource(
  notebookTracker: INotebookTracker,
  newSource: string
): boolean {
  const notebook = notebookTracker.currentWidget;
  if (!notebook) {
    return false;
  }
  const activeCell = notebook.content.activeCell;
  if (!activeCell) {
    return false;
  }
  activeCell.model.sharedModel.source = newSource;
  return true;
}

/**
 * Return the currently active NotebookPanel (if any).
 */
export function getActiveNotebookPanel(
  notebookTracker: INotebookTracker
): NotebookPanel | null {
  return notebookTracker.currentWidget ?? null;
}
