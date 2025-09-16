import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionList,
  IInlineCompletionProvider
} from '@jupyterlab/completer';
import { NotebookPanel } from '@jupyterlab/notebook';
import { generateText, LanguageModel } from 'ai';

import { AISettingsModel } from '../models/settings-model';
import type { ICompletionProviderRegistry } from '../tokens';
import { createCompletionModel } from '../providers/models';

/**
 * Configuration interface for provider-specific completion behavior
 */
export interface IProviderCompletionConfig {
  /**
   * Temperature setting for the provider
   */
  temperature?: number;

  /**
   * Whether the provider supports fill-in-the-middle completion
   */
  supportsFillInMiddle?: boolean;

  /**
   * Whether to set filterText for this provider
   */
  useFilterText?: boolean;

  /**
   * Custom prompt formatter for provider-specific requirements
   */
  customPromptFormat?: (prompt: string, suffix: string) => string;

  /**
   * Function to clean up provider-specific artifacts from completion text
   */
  cleanupCompletion?: (completion: string) => string;
}

/**
 * Default system prompt for code completion
 */
const DEFAULT_COMPLETION_SYSTEM_PROMPT = `You are an AI code completion assistant. Complete the given code fragment with appropriate code.
Rules:
- Return only the completion text, no explanations or comments
- Do not include code block markers (\`\`\` or similar)
- Make completions contextually relevant to the surrounding code and notebook context
- Follow the language-specific conventions and style guidelines for the detected programming language
- Keep completions concise but functional
- Do not repeat the existing code that comes before the cursor
- Use variables, imports, functions, and other definitions from previous notebook cells when relevant`;

/**
 * The generic completion provider to register to the completion provider manager.
 */
export class AICompletionProvider implements IInlineCompletionProvider {
  /**
   * Construct a new completion provider.
   */
  constructor(options: AICompletionProvider.IOptions) {
    this._settingsModel = options.settingsModel;
    this._completionProviderRegistry = options.completionProviderRegistry;
    this._settingsModel.stateChanged.connect(() => {
      this._updateModel();
    });
    this._updateModel();
  }

  /**
   * The unique identifier of the provider.
   */
  readonly identifier = '@jupyterlite/ai:completer';

  /**
   * Get the current completer name based on settings.
   */
  get name(): string {
    const activeProvider = this._settingsModel.getCompleterProvider();
    return activeProvider ? `${activeProvider.provider}-completer` : 'none';
  }

  /**
   * Get the system prompt for the completion.
   */
  get systemPrompt(): string {
    return DEFAULT_COMPLETION_SYSTEM_PROMPT;
  }

  /**
   * Fetch completion items based on the request and context.
   */
  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ): Promise<IInlineCompletionList> {
    if (!this._model) {
      return { items: [] };
    }

    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);
    const suffix = text.slice(cursorOffset);

    // Get current provider settings
    const activeProvider = this._settingsModel.getCompleterProvider();
    if (!activeProvider) {
      return { items: [] };
    }

    const provider = activeProvider.provider;
    const providerConfig = this._getProviderCompletionConfig(provider);

    try {
      let completionPrompt: string;

      // Check if we're in a notebook or file and handle context accordingly
      if (context.widget instanceof NotebookPanel) {
        // Extract notebook context with surrounding cells
        const contextString = this._extractNotebookContext(context, request);
        completionPrompt = contextString;
      } else {
        // For files, use simpler approach
        completionPrompt = prompt.trim();
        if (providerConfig.customPromptFormat && suffix.trim()) {
          completionPrompt = providerConfig.customPromptFormat(prompt, suffix);
        }
      }

      const { text: completion } = await generateText({
        model: this._model,
        prompt: completionPrompt,
        system: this.systemPrompt,
        temperature: providerConfig.temperature || 0.3
      });

      // Clean up provider-specific artifacts if cleanup function is provided
      let cleanCompletion = completion;
      if (providerConfig.cleanupCompletion) {
        cleanCompletion = providerConfig.cleanupCompletion(completion);
      }

      const items = [
        {
          insertText: cleanCompletion,
          filterText: providerConfig.useFilterText
            ? prompt.substring(completionPrompt.length)
            : undefined
        }
      ];

      return { items };
    } catch (error) {
      console.error(`Error fetching completions from ${provider}:`, error);
      return { items: [] };
    }
  }

  /**
   * Update the language model based on current settings.
   */
  private _updateModel(): void {
    const activeProvider = this._settingsModel.getCompleterProvider();
    if (!activeProvider) {
      this._model = null;
      return;
    }

    const provider = activeProvider.provider;
    const model = activeProvider.model;
    const apiKey = this._settingsModel.getApiKey(activeProvider.id);

    try {
      this._model = createCompletionModel(
        {
          provider,
          model,
          apiKey
        },
        this._completionProviderRegistry
      );
    } catch (error) {
      console.error(`Error creating model for ${provider}:`, error);
      this._model = null;
    }
  }

  /**
   * Extract context from notebook cells
   */
  private _extractNotebookContext(
    context: IInlineCompletionContext,
    request: CompletionHandler.IRequest
  ): string {
    const { text, offset: cursorOffset } = request;
    let codeBeforeCursor = text.slice(0, cursorOffset);
    let codeAfterCursor = text.slice(cursorOffset);

    const notebookPanel = context.widget as NotebookPanel;
    const notebook = notebookPanel.content;
    const currentCellIndex = notebook.activeCellIndex;
    const cells = notebook.widgets;

    // For notebooks, include context from surrounding cells
    const cellsAbove: string[] = [];
    const cellsBelow: string[] = [];

    // Get content from cells above current cell
    for (let i = 0; i < currentCellIndex; i++) {
      const cell = cells[i];
      if (cell.model.type === 'code') {
        const source = cell.model.sharedModel.source;
        if (source.trim()) {
          cellsAbove.push(source.trim());
        }
      }
    }

    // Get content from cells below current cell
    for (let i = currentCellIndex + 1; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.model.type === 'code') {
        const source = cell.model.sharedModel.source;
        if (source.trim()) {
          cellsBelow.push(source.trim());
        }
      }
    }

    // Include cells above in the code before cursor
    if (cellsAbove.length > 0) {
      const cellsAboveText = cellsAbove
        .map((cell, index) => `# Cell ${index + 1}:\n${cell}`)
        .join('\n\n');
      codeBeforeCursor = `${cellsAboveText}\n\n# Current cell:\n${codeBeforeCursor}`;
    }

    // Include cells below in the code after cursor
    if (cellsBelow.length > 0) {
      const cellsBelowText = cellsBelow
        .map((cell, index) => `# Cell ${index + 1}:\n${cell}`)
        .join('\n\n');
      codeAfterCursor = `${codeAfterCursor}\n\n# Cells below:\n${cellsBelowText}`;
    }

    const parts: string[] = [];

    // Add code before cursor
    if (codeBeforeCursor) {
      parts.push('# Code before cursor:');
      parts.push(codeBeforeCursor);
    }

    // Add completion instruction
    parts.push('# Complete the code at cursor position');

    // Add code after cursor
    if (codeAfterCursor) {
      parts.push('# Code after cursor:');
      parts.push(codeAfterCursor);
    }

    return parts.length > 1 ? parts.join('\n\n') + '\n\n' : '';
  }

  /**
   * Get provider-specific completion configuration from registry
   */
  private _getProviderCompletionConfig(
    provider: string
  ): IProviderCompletionConfig {
    const providerInfo =
      this._completionProviderRegistry?.getProviderInfo(provider);
    const completionConfig = providerInfo?.customSettings?.completionConfig;

    // Return provider config or default config
    return (
      completionConfig || {
        temperature: 0.3,
        supportsFillInMiddle: false,
        useFilterText: false
      }
    );
  }

  private _settingsModel: AISettingsModel;
  private _completionProviderRegistry?: ICompletionProviderRegistry;
  private _model: LanguageModel | null = null;
}

export namespace AICompletionProvider {
  /**
   * The options for the constructor of the completion provider.
   */
  export interface IOptions {
    /**
     * The AI settings model.
     */
    settingsModel: AISettingsModel;
    /**
     * The completion provider registry.
     */
    completionProviderRegistry?: ICompletionProviderRegistry;
  }
}
