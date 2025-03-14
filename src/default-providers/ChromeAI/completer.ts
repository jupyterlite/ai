import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { LLM } from '@langchain/core/language_models/llms';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { BaseCompleter, IBaseCompleter } from '../../base-completer';
import { COMPLETION_SYSTEM_PROMPT } from '../../provider';

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

export class ChromeCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._chromeProvider = new ChromeAI({ ...options.settings });
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

  get provider(): LLM {
    return this._chromeProvider;
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);

    const trimmedPrompt = prompt.trim();

    const messages = [
      new SystemMessage(this._prompt),
      new HumanMessage(trimmedPrompt)
    ];

    try {
      let response = await this._chromeProvider.invoke(messages);

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

  private _chromeProvider: ChromeAI;
  private _prompt: string = COMPLETION_SYSTEM_PROMPT;
}
