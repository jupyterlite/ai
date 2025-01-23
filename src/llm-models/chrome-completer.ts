import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { ChromeAI } from '@langchain/community/experimental/llms/chrome_ai';
import { LLM } from '@langchain/core/language_models/llms';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseCompleter, IBaseCompleter } from './base-completer';

/**
 * The default prompt for the completion request
 * TODO: move somewhere else so it can be used by other completers
 * See: https://github.com/jupyterlite/ai/issues/25
 */
const DEFAULT_PROMPT = `
You are an application built to provide helpful code completion suggestions.
You should only produce code. Produce clean code.
The code is written in JupyterLab, a data analysis and code development
environment which can execute code extended with additional syntax for
interactive features, such as magics.
Only give raw strings back, do not format the response using backticks!
The output should be a single string, and should correspond to what a human users
would write.
Do not include the prompt in the output, only the string that should be appended to the current input.
`;

export class ChromeCompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._chromeProvider = new ChromeAI({ ...options.settings });
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
    // const suffix = text.slice(cursorOffset);

    const trimmedPrompt = prompt.trim();

    // TODO: this should include more messages
    const messages = [
      new SystemMessage(DEFAULT_PROMPT),
      new HumanMessage(trimmedPrompt)
    ];

    try {
      const response = await this._chromeProvider.invoke(messages);

      if (response.startsWith('```')) {
        console.log('Skipping response that includes code block');
        return { items: [] };
      }

      console.log('input:', trimmedPrompt);
      console.log('response:', response);

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
}
