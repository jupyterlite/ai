import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { LLM } from '@langchain/core/language_models/llms';
import { MistralAI } from '@langchain/mistralai';
import { Throttler } from '@lumino/polling';
import { CompletionRequest } from '@mistralai/mistralai';

import { BaseCompleter, IBaseCompleter } from './base-completer';
import { COMPLETION_SYSTEM_PROMPT } from '../provider';

/**
 * The Mistral API has a rate limit of 1 request per second
 */
const INTERVAL = 1000;

/**
 * Timeout to avoid endless requests
 */
const REQUEST_TIMEOUT = 3000;

export class CodestralCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    // this._requestCompletion = options.requestCompletion;
    this._mistralProvider = new MistralAI({ ...options.settings });
    this._throttler = new Throttler(
      async (data: CompletionRequest) => {
        const invokedData = data;

        // Request completion.
        const request = this._mistralProvider.completionWithRetry(
          data,
          {},
          false
        );
        const timeoutPromise = new Promise<null>(resolve => {
          return setTimeout(() => resolve(null), REQUEST_TIMEOUT);
        });

        // Fetch again if the request is too long or if the prompt has changed.
        const response = await Promise.race([request, timeoutPromise]);
        if (
          response === null ||
          invokedData.prompt !== this._currentData?.prompt
        ) {
          return {
            items: [],
            fetchAgain: true
          };
        }

        // Extract results of completion request.
        const items = response.choices.map((choice: any) => {
          return { insertText: choice.message.content as string };
        });

        return {
          items
        };
      },
      { limit: INTERVAL }
    );
  }

  get provider(): LLM {
    return this._mistralProvider;
  }

  /**
   * Getter and setter for the initial prompt.
   */
  get prompt(): string {
    return this._prompt;
  }
  set prompt(value: string) {
    this._prompt = value;
  }

  set requestCompletion(value: () => void) {
    this._requestCompletion = value;
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);
    const suffix = text.slice(cursorOffset);

    const data = {
      prompt,
      suffix,
      model: this._mistralProvider.model,
      // temperature: 0,
      // top_p: 1,
      // max_tokens: 1024,
      // min_tokens: 0,
      stream: false,
      // random_seed: 1337,
      stop: []
    };

    try {
      this._currentData = data;
      const completionResult = await this._throttler.invoke(data);
      if (completionResult.fetchAgain) {
        if (this._requestCompletion) {
          this._requestCompletion();
        }
      }
      return { items: completionResult.items };
    } catch (error) {
      console.error('Error fetching completions', error);
      return { items: [] };
    }
  }

  private _requestCompletion?: () => void;
  private _throttler: Throttler;
  private _mistralProvider: MistralAI;
  private _prompt: string = COMPLETION_SYSTEM_PROMPT;
  private _currentData: CompletionRequest | null = null;
}
