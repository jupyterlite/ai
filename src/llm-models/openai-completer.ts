import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { BaseLLM } from '@langchain/core/language_models/llms';
import { OpenAI } from '@langchain/openai';

import { BaseCompleter, IBaseCompleter } from './base-completer';

export class OpenAICompleter implements IBaseCompleter {
  constructor(options: BaseCompleter.IOptions) {
    this._gptProvider = new OpenAI({ ...options.settings });
  }

  get provider(): BaseLLM {
    return this._gptProvider;
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) {
    const { text, offset: cursorOffset } = request;
    const prompt = text.slice(0, cursorOffset);
    const suffix = text.slice(cursorOffset);

    const data = {
      prompt,
      suffix,
      model: this._gptProvider.model,
      // temperature: 0,
      // top_p: 1,
      // max_tokens: 1024,
      // min_tokens: 0,
      // random_seed: 1337,
      stop: []
    };

    try {
      const response = await this._gptProvider.completionWithRetry(data, {});
      const items = response.choices.map((choice: any) => {
        return { insertText: choice.message.content as string };
      });
      return items;
    } catch (error) {
      console.error('Error fetching completions', error);
      return { items: [] };
    }
  }

  private _gptProvider: OpenAI;
}
