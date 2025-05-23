import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

export interface IBaseCompleter {
  /**
   * The completion prompt.
   */
  prompt: string;

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
