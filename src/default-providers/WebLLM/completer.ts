import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatWebLLM } from '@langchain/community/chat_models/webllm';
import { BaseCompleter, IBaseCompleter } from '../../base-completer';
import { COMPLETION_SYSTEM_PROMPT } from '../../provider';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

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

export class WebLLMCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._completer = new ChatWebLLM({
      model: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
      chatOptions: {
        temperature: 0.5
      }
    });
    void this._completer.initialize((progress: any) => {
      console.log(progress);
    });
  }

  get completer(): BaseChatModel {
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

  get provider(): ChatWebLLM {
    return this._completer;
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
      // TODO: this does not work yet
      const response = await this._completer.invoke(messages);
      let content = response.content as string;

      if (CODE_BLOCK_START_REGEX.test(content)) {
        content = content
          .replace(CODE_BLOCK_START_REGEX, '')
          .replace(CODE_BLOCK_END_REGEX, '');
      }

      const items = [{ insertText: content }];
      return {
        items
      };
    } catch (error) {
      console.error('Error fetching completion:', error);
      return { items: [] };
    }
  }

  private _completer: ChatWebLLM;
  private _prompt: string = COMPLETION_SYSTEM_PROMPT;
}
