import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';

import { BaseCompleter } from '../../base-completer';

export class OllamaCompleter extends BaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    super(options);
    this._completer = new ChatOllama({ ...options.settings });
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);

    const messages = [
      new SystemMessage(this.systemPrompt),
      new AIMessage(prompt)
    ];

    try {
      const response = await this._completer.invoke(messages);
      const items = [];
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
            filterText: prompt.substring(prompt.length)
          });
        });
      }
      return { items };
    } catch (error) {
      console.error('Error fetching completions', error);
      return { items: [] };
    }
  }

  protected _completer: ChatOllama;
}
