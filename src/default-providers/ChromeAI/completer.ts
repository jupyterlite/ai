import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

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

export class ChromeCompleter extends BaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    super(options);
    this._completer = new ChromeAI({ ...options.settings });
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);

    const trimmedPrompt = prompt.trim();

    const messages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(trimmedPrompt)
    ];

    try {
      let response = await this._completer.invoke(messages);

      // ChromeAI sometimes returns a string starting with '```',
      // so process the response to remove the code block delimiters
      if (CODE_BLOCK_START_REGEX.test(response)) {
        response = response
          .replace(CODE_BLOCK_START_REGEX, '')
          .replace(CODE_BLOCK_END_REGEX, '');
      }

      const items = [{ insertText: response }];
      return {
        items
      };
    } catch (error) {
      console.error('Error fetching completion:', error);
      return { items: [] };
    }
  }

  protected _completer: ChromeAI;
}
