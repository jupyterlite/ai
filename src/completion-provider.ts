import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionProvider
} from '@jupyterlab/completer';

import { IBaseCompleter } from './llm-models';
import { IAIProvider } from './token';

/**
 * The generic completion provider to register to the completion provider manager.
 */
export class CompletionProvider implements IInlineCompletionProvider {
  readonly identifier = '@jupyterlite/ai';

  constructor(options: CompletionProvider.IOptions) {
    this._aiProvider = options.aiProvider;
    this._requestCompletion = options.requestCompletion;

    this._aiProvider.modelChange.connect(() => {
      if (this.completer) {
        this.completer.requestCompletion = this._requestCompletion;
      }
    });
  }

  /**
   * Get the current completer name.
   */
  get name(): string {
    return this._aiProvider.name;
  }

  /**
   * Get the current completer.
   */
  get completer(): IBaseCompleter | null {
    return this._aiProvider.completer;
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    return this.completer?.fetch(request, context);
  }

  private _aiProvider: IAIProvider;
  private _requestCompletion: () => void;
}

export namespace CompletionProvider {
  export interface IOptions {
    aiProvider: IAIProvider;
    requestCompletion: () => void;
  }
}
