import {
  CompletionHandler,
  IInlineCompletionContext,
  IInlineCompletionProvider
} from '@jupyterlab/completer';

import { IAIProviderRegistry } from './tokens';
import { AICompleter } from './types/ai-model';

/**
 * The generic completion provider to register to the completion provider manager.
 */
export class CompletionProvider implements IInlineCompletionProvider {
  readonly identifier = '@jupyterlite/ai';

  constructor(options: CompletionProvider.IOptions) {
    this._providerRegistry = options.providerRegistry;
    this._requestCompletion = options.requestCompletion;

    this._providerRegistry.providerChanged.connect(() => {
      if (this.completer) {
        this.completer.requestCompletion = this._requestCompletion;
      }
    });
  }

  /**
   * Get the current completer name.
   */
  get name(): string {
    return this._providerRegistry.currentName('completer');
  }

  /**
   * Get the current completer.
   */
  get completer(): AICompleter | null {
    return this._providerRegistry.currentCompleter;
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    return this.completer?.fetch(request, context);
  }

  private _providerRegistry: IAIProviderRegistry;
  private _requestCompletion: () => void;
}

export namespace CompletionProvider {
  export interface IOptions {
    /**
     * The registry where the completion provider belongs.
     */
    providerRegistry: IAIProviderRegistry;
    /**
     * The request completion commands, can be useful if a provider needs to request
     * the completion by itself.
     */
    requestCompletion: () => void;
  }
}
