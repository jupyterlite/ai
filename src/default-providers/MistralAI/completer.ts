import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { MistralAI } from '@langchain/mistralai';

import { BaseCompleter, IBaseCompleter } from '../../base-completer';
import { COMPLETION_SYSTEM_PROMPT } from '../../provider';

const CODE_BLOCK_START_REGEX = /^```(?:[a-zA-Z]+)?\n?/;
const CODE_BLOCK_END_REGEX = /```$/;

/**
 * The completer for the MistralAI model.
 */
export class CodestralCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._completer = new MistralAI({ ...options.settings });
  }

  get completer(): BaseLanguageModel {
    return this._completer;
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

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    try {
      const { text, offset: cursorOffset } = request;
      const prompt = text.slice(0, cursorOffset);
      const suffix = text.slice(cursorOffset);
      this._controller.abort();
      this._controller = new AbortController();

      const response = await this._completer.completionWithRetry(
        {
          prompt,
          model: this._completer.model,
          suffix
        },
        { signal: this._controller.signal },
        false
      );
      const items = response.choices.map(choice => {
        const content = choice.message.content
          .replace(CODE_BLOCK_START_REGEX, '')
          .replace(CODE_BLOCK_END_REGEX, '');
        return {
          insertText: content
        };
      });
      return { items };
    } catch (error) {
      // the request may be aborted
      return { items: [] };
    }
  }

  private _controller = new AbortController();
  private _completer: MistralAI;
  private _prompt: string = COMPLETION_SYSTEM_PROMPT;
}
