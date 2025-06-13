import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, SystemMessage } from '@langchain/core/messages';

import { BaseCompleter } from '../../base-completer';

export class AnthropicCompleter extends BaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    super(options);
    this._completer = new ChatAnthropic({ ...options.settings });
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
      new SystemMessage(this.systemPrompt),
      new AIMessage(trimmedPrompt)
    ];

    try {
      const response = await this._completer.invoke(messages);
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

  protected _completer: ChatAnthropic;
}
