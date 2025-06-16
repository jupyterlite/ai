import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { DEFAULT_COMPLETION_SYSTEM_PROMPT } from './default-prompts';
import { IAIProviderRegistry } from './tokens';

export interface IBaseCompleter {
  /**
   * The completion prompt.
   */
  readonly systemPrompt: string;

  /**
   * The function to fetch a new completion.
   */
  requestCompletion?: () => void;

  /**
   * The fetch request for the LLM completer.
   */
  fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ): Promise<any>;
}

export abstract class BaseCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._providerRegistry = options.providerRegistry;
  }

  /**
   * Get the system prompt for the completion.
   */
  get systemPrompt(): string {
    return (
      this._providerRegistry.completerSystemPrompt ??
      DEFAULT_COMPLETION_SYSTEM_PROMPT
    );
  }

  /**
   * The fetch request for the LLM completer.
   */
  abstract fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ): Promise<any>;

  protected _providerRegistry: IAIProviderRegistry;
  protected abstract _completer: BaseLanguageModel<any, any>;
}

/**
 * The namespace for the base completer.
 */
export namespace BaseCompleter {
  /**
   * The options for the constructor of a completer.
   */
  export interface IOptions {
    /**
     * The provider registry.
     */
    providerRegistry: IAIProviderRegistry;
    /**
     * The settings of the provider.
     */
    settings: ReadonlyPartialJSONObject;
  }
}
