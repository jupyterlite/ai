import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage
} from '@langchain/core/messages';
import { ChatMistralAI } from '@langchain/mistralai';
import { Throttler } from '@lumino/polling';

import { BaseCompleter, IBaseCompleter } from './base-completer';
import { COMPLETION_SYSTEM_PROMPT } from '../provider';

/**
 * The Mistral API has a rate limit of 1 request per second
 */
const INTERVAL = 1000;

/**
 * The default prompt for the completion request
 * TODO: move somewhere else so it can be used by other completers
 * See: https://github.com/jupyterlite/ai/issues/25
 */
const DEFAULT_PROMPT = `
You are an application built to provide helpful code completion suggestions. \
You should only produce code. Keep comments to minimum, use the \
programming language comment syntax. Produce clean code. \
The output should be a single string, and should correspond to what a human users \
would write after the content of the message, without fenced code block and backtick. \
The code is written in JupyterLab, a data analysis and code development \
environment which can execute code extended with additional syntax for \
interactive features, such as magics.
`;

export class CodestralCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._mistralProvider = new ChatMistralAI({ ...options.settings });
    this._throttler = new Throttler(
      async (messages: BaseMessage[]) => {
        const response = await this._mistralProvider.invoke(messages);
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

  get provider(): BaseChatModel {
    return this._mistralProvider;
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

    const messages: BaseMessage[] = [
      new SystemMessage(DEFAULT_PROMPT),
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
  private _mistralProvider: ChatMistralAI;
  private _prompt: string = COMPLETION_SYSTEM_PROMPT;
}
