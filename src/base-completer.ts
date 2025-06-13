import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { COMPLETION_SYSTEM_PROMPT } from './provider';

export interface IBaseCompleter {
  /**
   * The completion prompt.
   */
  systemPrompt: string;

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
    if (
      options.settings.completion_prompt &&
      options.settings.completion_prompt !== this._systemPrompt
    ) {
      this._systemPrompt = options.settings.completion_prompt as string;
    }
  }

  /**
   * Get the system prompt.
   */
  get systemPrompt(): string {
    return this._systemPrompt;
  }

  /**
   * The fetch request for the LLM completer.
   */
  abstract fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ): Promise<any>;

  private _systemPrompt: string = COMPLETION_SYSTEM_PROMPT;
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
    settings: ReadonlyPartialJSONObject;
  }
}
