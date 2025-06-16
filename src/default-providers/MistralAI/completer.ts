import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage
} from '@langchain/core/messages';
import { ChatMistralAI } from '@langchain/mistralai';
import { Throttler } from '@lumino/polling';

import { BaseCompleter } from '../../base-completer';

/**
 * The Mistral API has a rate limit of 1 request per second
 */
const INTERVAL = 1000;

export class CodestralCompleter extends BaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    super(options);
    this._completer = new ChatMistralAI({ ...options.settings });
    this._throttler = new Throttler(
      async (messages: BaseMessage[]) => {
        const response = await this._completer.invoke(messages);
        // Extract results of completion request.
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
              insertText: content.text
            });
          });
        }
        return { items };
      },
      { limit: INTERVAL }
    );
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);

    const messages: BaseMessage[] = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(prompt)
    ];

    try {
      return await this._throttler.invoke(messages);
    } catch (error) {
      console.error('Error fetching completions', error);
      return { items: [] };
    }
  }

  private _throttler: Throttler;
  protected _completer: ChatMistralAI;
}
