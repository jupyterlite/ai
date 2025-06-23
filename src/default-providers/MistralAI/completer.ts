import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { MistralAI } from '@langchain/mistralai';

import { BaseCompleter } from '../../base-completer';

const CODE_BLOCK_START_REGEX = /^```(?:[a-zA-Z]+)?\n?/;
const CODE_BLOCK_END_REGEX = /```$/;

export class CodestralCompleter extends BaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    super(options);
    this._completer = new MistralAI({ ...options.settings });
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    try {
      const { text, offset: cursorOffset } = request;
      const prompt = this.systemPrompt.concat(text.slice(0, cursorOffset));
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
  protected _completer: MistralAI;
}
