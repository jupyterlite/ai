import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatWebLLM } from '@langchain/community/chat_models/webllm';

import { BaseCompleter } from '../../base-completer';

/**
 * Regular expression to match the '```' string at the start of a string.
 * So the completions returned by the LLM can still be kept after removing the code block formatting.
 *
 * For example, if the response contains the following content after typing `import pandas`:
 *
 * ```python
 * as pd
 * ```
 *
 * The formatting string after removing the code block delimiters will be:
 *
 * as pd
 */
const CODE_BLOCK_START_REGEX = /^```(?:[a-zA-Z]+)?\n?/;

/**
 * Regular expression to match the '```' string at the end of a string.
 */
const CODE_BLOCK_END_REGEX = /```$/;

export class WebLLMCompleter extends BaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    super(options);
    const model = options.settings.model as string;
    // provide model separately since ChatWebLLM expects it
    this._completer = new ChatWebLLM({
      ...options.settings,
      model
    });

    // Initialize the model and track its status
    this._isInitialized = false;
    this._isInitializing = false;
    this._initError = null;
    void this._initializeModel();
  }

  /**
   * Initialize the WebLLM model
   */
  private async _initializeModel(): Promise<void> {
    if (this._isInitialized || this._isInitializing) {
      return;
    }

    this._isInitializing = true;
    try {
      await this._completer.initialize((progress: any) => {
        console.log('WebLLM initialization progress:', progress);
      });
      this._isInitialized = true;
      this._isInitializing = false;
      console.log('WebLLM model successfully initialized');
    } catch (error) {
      this._initError =
        error instanceof Error ? error : new Error(String(error));
      this._isInitializing = false;
      console.error('Failed to initialize WebLLM model:', error);
    }
  }

  get provider(): ChatWebLLM {
    return this._completer;
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    // Abort any pending request
    if (this._abortController) {
      this._abortController.abort();
    }

    // Create a new abort controller for this request
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    if (!this._isInitialized) {
      if (this._initError) {
        console.error('WebLLM model failed to initialize:', this._initError);
        return { items: [] };
      }

      if (!this._isInitializing) {
        // Try to initialize again if it's not currently initializing
        await this._initializeModel();
      } else {
        console.log(
          'WebLLM model is still initializing, please try again later'
        );
        return { items: [] };
      }

      // Return empty if still not initialized
      if (!this._isInitialized) {
        return { items: [] };
      }
    }

    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);
    const trimmedPrompt = prompt.trim();

    const messages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(trimmedPrompt)
    ];

    try {
      console.log('Trigger invoke');
      const response = await this._completer.invoke(messages, { signal });
      let content = response.content as string;
      console.log('Response content:', content);

      if (CODE_BLOCK_START_REGEX.test(content)) {
        content = content
          .replace(CODE_BLOCK_START_REGEX, '')
          .replace(CODE_BLOCK_END_REGEX, '');
      }

      const items = [{ insertText: content }];
      return {
        items
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error fetching completion from WebLLM:', error.message);
      } else {
        console.error('Unknown error fetching completion from WebLLM:', error);
      }
      return { items: [] };
    }
  }

  protected _completer: ChatWebLLM;
  private _isInitialized: boolean = false;
  private _isInitializing: boolean = false;
  private _initError: Error | null = null;
  private _abortController: AbortController | null = null;
}
