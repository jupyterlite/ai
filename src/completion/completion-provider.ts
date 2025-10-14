import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionList,
  IInlineCompletionProvider
} from '@jupyterlab/completer';
import { NotebookPanel } from '@jupyterlab/notebook';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { generateText } from 'ai';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { AISettingsModel } from '../models/settings-model';
import { createCompletionModel } from '../providers/models';
import { SECRETS_NAMESPACE, type IProviderRegistry } from '../tokens';

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
 * Default temperature for code completion (lower than chat for more deterministic results)
 */
const DEFAULT_COMPLETION_TEMPERATURE = 0.3;

/**
 * The generic completion provider to register to the completion provider manager.
 */
export class AICompletionProvider implements IInlineCompletionProvider {
  /**
   * Construct a new completion provider.
   */
  constructor(options: AICompletionProvider.IOptions) {
    Private.setToken(options.token);
    this._settingsModel = options.settingsModel;
    this._providerRegistry = options.providerRegistry;
    this._secretsManager = options.secretsManager;
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
    const providerConfig = this._getProviderCompletionConfig();

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
        // Apply fill-in-middle formatting if supported and suffix exists
        if (providerConfig.supportsFillInMiddle && suffix.trim()) {
          completionPrompt = `<PRE>${prompt}<SUF>${suffix}<MID>`;
        }
      }

      const { text: completion } = await generateText({
        model: this._model,
        prompt: completionPrompt,
        system: this.systemPrompt,
        temperature: providerConfig.temperature || 0.3
      });

      // Clean up FIM tags and code block markers
      const cleanCompletion = completion
        .replace(/<PRE>/g, '')
        .replace(/<SUF>/g, '')
        .replace(/<MID>/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();

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
  private async _updateModel(): Promise<void> {
    const activeProvider = this._settingsModel.getCompleterProvider();
    if (!activeProvider) {
      this._model = null;
      return;
    }

    const provider = activeProvider.provider;
    const model = activeProvider.model;
    const baseURL = activeProvider.baseURL;

    let apiKey: string;
    if (this._secretsManager && this._settingsModel.config.useSecretsManager) {
      apiKey =
        (
          await this._secretsManager.get(
            Private.getToken(),
            SECRETS_NAMESPACE,
            `${provider}:apiKey`
          )
        )?.value ?? '';
    } else {
      apiKey = this._settingsModel.getApiKey(activeProvider.id);
    }

    try {
      this._model = createCompletionModel(
        {
          provider,
          model,
          apiKey,
          baseURL
        },
        this._providerRegistry
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
   * Get provider-specific completion configuration
   */
  private _getProviderCompletionConfig(): IProviderCompletionConfig {
    // Get provider-specific completion parameters
    const activeProvider = this._settingsModel.getCompleterProvider();

    // Use provider-specific temperature or fall back to default
    const temperature =
      activeProvider?.parameters?.temperature ?? DEFAULT_COMPLETION_TEMPERATURE;
    const supportsFillInMiddle =
      activeProvider?.parameters?.supportsFillInMiddle ?? false;
    const useFilterText = activeProvider?.parameters?.useFilterText ?? false;

    return {
      temperature,
      supportsFillInMiddle,
      useFilterText
    };
  }

  private _settingsModel: AISettingsModel;
  private _providerRegistry?: IProviderRegistry;
  private _model: LanguageModelV2 | null = null;
  private _secretsManager?: ISecretsManager;
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
     * The provider registry
     */
    providerRegistry?: IProviderRegistry;
    /**
     * The secrets manager.
     */
    secretsManager?: ISecretsManager;
    /**
     * The token used to request the secrets manager.
     */
    token: symbol;
  }
}

namespace Private {
  /**
   * The token to use with the secrets manager, setter and getter.
   */
  let secretsToken: symbol;
  export function setToken(value: symbol): void {
    secretsToken = value;
  }
  export function getToken(): symbol {
    return secretsToken;
  }
}
