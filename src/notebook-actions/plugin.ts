/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { INotebookTracker } from '@jupyterlab/notebook';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import { ToolbarButton } from '@jupyterlab/ui-components';

import { streamText, type LanguageModel } from 'ai';

import { IAISettingsModel, IProviderRegistry } from '../tokens';
import type { AISettingsModel } from '../models/settings-model';

import {
  getActiveCellSource,
  getPreviousCellsSource,
  getActiveCellErrorOutput,
  getActiveCellStdout,
  setActiveCellSource
} from './cell-utils';

import {
  formatPrompt,
  explainPrompt,
  debugPrompt,
  completePrompt,
  reviewPrompt
} from './prompts';

import {
  formatIcon,
  explainIcon,
  debugIcon,
  completeIcon,
  reviewIcon
} from './icons';

/**
 * Command IDs for notebook actions.
 */
const ACTION_COMMANDS = {
  format: '@jupyterlite/ai:notebook-action-format',
  explain: '@jupyterlite/ai:notebook-action-explain',
  debug: '@jupyterlite/ai:notebook-action-debug',
  complete: '@jupyterlite/ai:notebook-action-complete',
  review: '@jupyterlite/ai:notebook-action-review'
} as const;

/**
 * Create a LanguageModel from the current default provider settings.
 */
function createModelFromSettings(
  settingsModel: AISettingsModel,
  providerRegistry: IProviderRegistry
): LanguageModel | null {
  const config = settingsModel.getDefaultProvider();
  if (!config) {
    return null;
  }

  try {
    return (
      providerRegistry.createChatModel(config.provider, {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        headers: config.headers
      }) ?? null
    );
  } catch (e) {
    console.error('Failed to create model for notebook action', e);
    return null;
  }
}

/**
 * Extract the first fenced code block from an AI response.
 * Returns null if no code block is found.
 */
function extractCodeBlock(text: string): string | null {
  const match = text.match(/```[^\n]*\n([\s\S]*?)```/);
  return match ? match[1].trimEnd() : null;
}

/**
 * Extract code from a (possibly incomplete) fenced code block during streaming.
 * Returns the code found so far and whether the block is complete.
 * Returns null if no opening fence has been seen yet.
 */
function extractPartialCodeBlock(
  text: string
): { code: string; complete: boolean } | null {
  const openMatch = text.match(/```[^\n]*\n/);
  if (!openMatch || openMatch.index === undefined) {
    return null;
  }
  const codeStart = openMatch.index + openMatch[0].length;
  const rest = text.slice(codeStart);
  // Match closing fence at start of line or at end of text
  const closeMatch = rest.match(/\n```(?:\s|$)/);
  if (closeMatch && closeMatch.index !== undefined) {
    return { code: rest.slice(0, closeMatch.index), complete: true };
  }
  // Also check if text ends with ``` (no trailing newline)
  if (rest.endsWith('```')) {
    const trimmed = rest.slice(0, -3);
    if (trimmed.endsWith('\n')) {
      return { code: trimmed.slice(0, -1), complete: true };
    }
  }
  return { code: rest, complete: false };
}

/**
 * Metadata key used to tag AI-generated outputs so we can find and
 * reuse / remove them.
 */
const AI_OUTPUT_TAG = '__jupyterlite_ai_action__';

/**
 * Find the index of the existing shared AI output in a cell's outputs,
 * or return -1 if none exists.
 */
function findAIOutputIndex(outputs: any): number {
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs.get(i);
    if (output?.metadata?.[AI_OUTPUT_TAG]) {
      return i;
    }
  }
  return -1;
}

/**
 * Write (or overwrite) the single shared AI output on the active cell.
 * Uses text/markdown so Jupyter renders the response as rich Markdown.
 * Returns the index of the output.
 */
function setAIOutput(
  notebookTracker: INotebookTracker,
  title: string,
  markdown: string
): number {
  const notebook = notebookTracker.currentWidget;
  if (!notebook) {
    return -1;
  }
  const activeCell = notebook.content.activeCell;
  if (!activeCell || activeCell.model.type !== 'code') {
    return -1;
  }

  const outputs = (activeCell.model as any).outputs;
  if (!outputs) {
    return -1;
  }

  const content = `**${title}**\n\n${markdown}`;

  const outputData = {
    output_type: 'display_data' as const,
    data: {
      'text/markdown': content,
      'text/plain': `[${title}]\n${markdown}`
    },
    metadata: { [AI_OUTPUT_TAG]: true }
  };

  const existing = findAIOutputIndex(outputs);
  if (existing !== -1) {
    outputs.set(existing, outputData);
    return existing;
  }

  outputs.add(outputData);
  return outputs.length - 1;
}

/**
 * Execute a notebook action:
 * 1. Read cell content (and context).
 * 2. Build the prompt.
 * 3. For "format" and "complete": stream code directly into the cell source
 *    (no extra output is created).
 * 4. For "explain", "debug", and "review": stream the AI response into a
 *    shared output area below the cell.
 */
async function executeAction(
  action: keyof typeof ACTION_COMMANDS,
  notebookTracker: INotebookTracker,
  settingsModel: AISettingsModel,
  providerRegistry: IProviderRegistry
): Promise<void> {
  const focalCode = getActiveCellSource(notebookTracker);
  if (!focalCode || !focalCode.trim()) {
    console.warn('No active cell or cell is empty');
    return;
  }

  const model = createModelFromSettings(settingsModel, providerRegistry);
  if (!model) {
    setAIOutput(
      notebookTracker,
      'Error',
      'No AI provider configured. Please add and select a provider in the AI settings.'
    );
    return;
  }

  // Build prompt based on the action
  let prompt: string;
  let title: string;

  switch (action) {
    case 'format': {
      prompt = formatPrompt(focalCode);
      title = 'AI Format';
      break;
    }
    case 'explain': {
      const previousCode = getPreviousCellsSource(notebookTracker);
      const stdout = getActiveCellStdout(notebookTracker);
      const errorOutput = getActiveCellErrorOutput(notebookTracker);
      prompt = explainPrompt(focalCode, previousCode, stdout, errorOutput);
      title = 'AI Explain';
      break;
    }
    case 'debug': {
      const previousCode = getPreviousCellsSource(notebookTracker);
      const errorOutput = getActiveCellErrorOutput(notebookTracker);
      prompt = debugPrompt(focalCode, previousCode, errorOutput);
      title = 'AI Debug';
      break;
    }
    case 'complete': {
      const previousCode = getPreviousCellsSource(notebookTracker);
      prompt = completePrompt(focalCode, previousCode);
      title = 'AI Complete';
      break;
    }
    case 'review': {
      const previousCode = getPreviousCellsSource(notebookTracker);
      prompt = reviewPrompt(focalCode, previousCode);
      title = 'AI Review';
      break;
    }
  }

  const isDirectReplace = action === 'format' || action === 'complete';

  if (isDirectReplace) {
    // For format/complete, stream code directly into the cell source
    // without creating an extra output area.
    const originalSource = focalCode;
    setActiveCellSource(notebookTracker, originalSource);
    setAIOutput(notebookTracker, title, '⏳ Processing…');

    try {
      const result = streamText({ model, prompt });
      let fullText = '';
      let codeStarted = false;

      for await (const delta of result.textStream) {
        fullText += delta;
        const extracted = extractPartialCodeBlock(fullText);
        if (extracted) {
          codeStarted = true;
          setActiveCellSource(notebookTracker, extracted.code);
        }
      }

      // Final pass: prefer the cleanly extracted complete code block
      const finalCode = extractCodeBlock(fullText);
      if (finalCode) {
        setActiveCellSource(notebookTracker, finalCode);
      } else if (!codeStarted) {
        // No code block found at all — restore original source
        setActiveCellSource(notebookTracker, originalSource);
      }
    } catch (error: any) {
      // Restore original source on error
      setActiveCellSource(notebookTracker, originalSource);
      const message =
        error?.message ?? 'Unknown error occurred while contacting the AI.';
      setAIOutput(notebookTracker, `${title} — Error`, message);
    }
  } else {
    // For explain, debug, review: stream into a shared AI output area
    setAIOutput(notebookTracker, title, '⏳ Thinking…');

    try {
      const result = streamText({ model, prompt });
      let fullText = '';

      for await (const delta of result.textStream) {
        fullText += delta;
        setAIOutput(notebookTracker, title, fullText);
      }
    } catch (error: any) {
      const message =
        error?.message ?? 'Unknown error occurred while contacting the AI.';
      setAIOutput(notebookTracker, `${title} — Error`, message);
    }
  }
}

/**
 * Plugin that adds notebook AI action buttons (Format, Explain, Debug,
 * Complete, Review) to the notebook toolbar.
 */
export const notebookActionsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:notebook-actions',
  description:
    'Notebook toolbar actions for AI-assisted formatting, explanation, debugging, completion, and code review.',
  autoStart: true,
  requires: [INotebookTracker, IAISettingsModel, IProviderRegistry],
  optional: [ITranslator],
  activate: (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    settingsModel: AISettingsModel,
    providerRegistry: IProviderRegistry,
    translator?: ITranslator
  ) => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');

    // Register commands
    const actionDefs: Array<{
      key: keyof typeof ACTION_COMMANDS;
      label: string;
      caption: string;
      icon: typeof formatIcon;
    }> = [
      {
        key: 'format',
        label: trans.__('AI Format'),
        caption: trans.__(
          'Format the active cell: add comments, docstrings, and improve formatting'
        ),
        icon: formatIcon
      },
      {
        key: 'explain',
        label: trans.__('AI Explain'),
        caption: trans.__('Explain the active cell code (ELI5 style)'),
        icon: explainIcon
      },
      {
        key: 'debug',
        label: trans.__('AI Debug'),
        caption: trans.__('Debug the error in the active cell'),
        icon: debugIcon
      },
      {
        key: 'complete',
        label: trans.__('AI Complete'),
        caption: trans.__('Complete the code in the active cell'),
        icon: completeIcon
      },
      {
        key: 'review',
        label: trans.__('AI Review'),
        caption: trans.__('Code review the active cell'),
        icon: reviewIcon
      }
    ];

    for (const def of actionDefs) {
      app.commands.addCommand(ACTION_COMMANDS[def.key], {
        label: def.label,
        caption: def.caption,
        icon: def.icon,
        isEnabled: () => {
          const cell = notebookTracker.currentWidget?.content.activeCell;
          return cell?.model.type === 'code';
        },
        execute: () =>
          executeAction(
            def.key,
            notebookTracker,
            settingsModel,
            providerRegistry
          )
      });
    }

    // Add toolbar buttons to each newly opened notebook, placed
    // right after the built-in left-side items (after "cellType").
    notebookTracker.widgetAdded.connect(
      (_sender: INotebookTracker, notebookPanel: any) => {
        // Small delay to ensure toolbar is ready
        requestAnimationFrame(() => {
          // Find the position just after the "cellType" dropdown so the
          // AI buttons sit with the other left-aligned toolbar items.
          const names: string[] = Array.from(
            notebookPanel.toolbar.names() as IterableIterator<string>
          );
          let insertIndex = names.indexOf('cellType');
          insertIndex = insertIndex === -1 ? 0 : insertIndex + 1;

          for (let i = 0; i < actionDefs.length; i++) {
            const def = actionDefs[i];
            const commandId = ACTION_COMMANDS[def.key];
            const button = new ToolbarButton({
              tooltip: def.caption,
              icon: def.icon,
              onClick: () => {
                app.commands.execute(commandId);
              }
            });
            button.addClass('jp-ai-notebook-action-button');
            notebookPanel.toolbar.insertItem(
              insertIndex + i,
              `ai-${def.key}`,
              button
            );
          }
        });
      }
    );
  }
};
