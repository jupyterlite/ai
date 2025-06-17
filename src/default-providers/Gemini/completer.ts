import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AIMessage, SystemMessage } from '@langchain/core/messages';

import { BaseCompleter } from '../../base-completer';

export class GeminiCompleter extends BaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    super(options);
    this._completer = new ChatGoogleGenerativeAI({
      model: 'gemini-pro',
      ...options.settings
    });
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
      new AIMessage(trimmedPrompt)
    ];

    try {
      const response = await this._completer.invoke(messages);
      const items = [];

      // Gemini can return string or complex content, a list of string/images/other.
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

  protected _completer: ChatGoogleGenerativeAI;
}
