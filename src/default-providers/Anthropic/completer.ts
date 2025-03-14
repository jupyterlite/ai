import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, SystemMessage } from '@langchain/core/messages';

import { BaseCompleter, IBaseCompleter } from '../../base-completer';
import { COMPLETION_SYSTEM_PROMPT } from '../../provider';

export class AnthropicCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._anthropicProvider = new ChatAnthropic({ ...options.settings });
  }

  get provider(): BaseChatModel {
    return this._anthropicProvider;
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
    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);

    // Anthropic does not allow whitespace at the end of the AIMessage
    const trimmedPrompt = prompt.trim();

    const messages = [
      new SystemMessage(this._prompt),
      new AIMessage(trimmedPrompt)
    ];

    try {
      const response = await this._anthropicProvider.invoke(messages);
      const items = [];

      // Anthropic can return string or complex content, a list of string/images/other.
      if (typeof response.content === 'string') {
        items.push({
          insertText: response.content
        });
      } else {
        response.content.forEach(content => {
          if (content.type !== 'text') {
            return;
          }
          items.push({
            insertText: content.text,
            filterText: prompt.substring(trimmedPrompt.length)
          });
        });
      }
      return { items };
    } catch (error) {
      console.error('Error fetching completions', error);
      return { items: [] };
    }
  }

  private _anthropicProvider: ChatAnthropic;
  private _prompt: string = COMPLETION_SYSTEM_PROMPT;
}
