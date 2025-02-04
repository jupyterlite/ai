import { ICompletionProviderManager } from '@jupyterlab/completer';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ISignal, Signal } from '@lumino/signaling';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { CompletionProvider } from './completion-provider';
import { getChatModel, IBaseCompleter } from './llm-models';
import { IAIProvider } from './token';

export const chatSystemPrompt = (options: AIProvider.IPromptOptions) => `
You are Jupyternaut, a conversational assistant living in JupyterLab to help users.
You are not a language model, but rather an application built on a foundation model from ${options.provider_name}.
You are talkative and you provide lots of specific details from the foundation model's context.
You may use Markdown to format your response.
If your response includes code, they must be enclosed in Markdown fenced code blocks (with triple backticks before and after).
If your response includes mathematical notation, they must be expressed in LaTeX markup and enclosed in LaTeX delimiters.
All dollar quantities (of USD) must be formatted in LaTeX, with the \`$\` symbol escaped by a single backslash \`\\\`.
- Example prompt: \`If I have \\\\$100 and spend \\\\$20, how much money do I have left?\`
- **Correct** response: \`You have \\(\\$80\\) remaining.\`
- **Incorrect** response: \`You have $80 remaining.\`
If you do not know the answer to a question, answer truthfully by responding that you do not know.
The following is a friendly conversation between you and a human.
`;

export const COMPLETION_SYSTEM_PROMPT = `
You are an application built to provide helpful code completion suggestions.
You should only produce code. Keep comments to minimum, use the
programming language comment syntax. Produce clean code.
The code is written in JupyterLab, a data analysis and code development
environment which can execute code extended with additional syntax for
interactive features, such as magics.
`;

export class AIProvider implements IAIProvider {
  constructor(options: AIProvider.IOptions) {
    this._completionProvider = new CompletionProvider({
      name: 'None',
      settings: {},
      requestCompletion: options.requestCompletion
    });
    options.completionProviderManager.registerInlineProvider(
      this._completionProvider
    );
  }

  get name(): string {
    return this._name;
  }

  /**
   * Get the current completer of the completion provider.
   */
  get completer(): IBaseCompleter | null {
    if (this._name === null) {
      return null;
    }
    return this._completionProvider.completer;
  }

  /**
   * Get the current llm chat model.
   */
  get chatModel(): BaseChatModel | null {
    if (this._name === null) {
      return null;
    }
    return this._llmChatModel;
  }

  /**
   * Get the current chat error;
   */
  get chatError(): string {
    return this._chatError;
  }

  /**
   * get the current completer error.
   */
  get completerError(): string {
    return this._completerError;
  }

  /**
   * Set the models (chat model and completer).
   * Creates the models if the name has changed, otherwise only updates their config.
   *
   * @param name - the name of the model to use.
   * @param settings - the settings for the models.
   */
  setModels(name: string, settings: ReadonlyPartialJSONObject) {
    try {
      this._completionProvider.setCompleter(name, settings);
      this._completerError = '';
    } catch (e: any) {
      this._completerError = e.message;
    }
    try {
      this._llmChatModel = getChatModel(name, settings);
      this._chatError = '';
    } catch (e: any) {
      this._chatError = e.message;
      this._llmChatModel = null;
    }
    this._name = name;
    this._modelChange.emit();
  }

  get modelChange(): ISignal<IAIProvider, void> {
    return this._modelChange;
  }

  private _completionProvider: CompletionProvider;
  private _llmChatModel: BaseChatModel | null = null;
  private _name: string = 'None';
  private _modelChange = new Signal<IAIProvider, void>(this);
  private _chatError: string = '';
  private _completerError: string = '';
}

export namespace AIProvider {
  /**
   * The options for the LLM provider.
   */
  export interface IOptions {
    /**
     * The completion provider manager in which register the LLM completer.
     */
    completionProviderManager: ICompletionProviderManager;
    /**
     * The application commands registry.
     */
    requestCompletion: () => void;
  }

  /**
   * The options for the Chat system prompt.
   */
  export interface IPromptOptions {
    /**
     * The provider name.
     */
    provider_name: string;
  }

  /**
   * This function indicates whether a key is writable in an object.
   * https://stackoverflow.com/questions/54724875/can-we-check-whether-property-is-readonly-in-typescript
   *
   * @param obj - An object extending the BaseLanguageModel interface.
   * @param key - A string as a key of the object.
   * @returns a boolean whether the key is writable or not.
   */
  export function isWritable<T extends BaseLanguageModel>(
    obj: T,
    key: keyof T
  ) {
    const desc =
      Object.getOwnPropertyDescriptor(obj, key) ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), key) ||
      {};
    return Boolean(desc.writable);
  }

  /**
   * Update the config of a language model.
   * It only updates the writable attributes of the model.
   *
   * @param model - the model to update.
   * @param settings - the configuration s a JSON object.
   */
  export function updateConfig<T extends BaseLanguageModel>(
    model: T,
    settings: ReadonlyPartialJSONObject
  ) {
    Object.entries(settings).forEach(([key, value], index) => {
      if (key in model) {
        const modelKey = key as keyof typeof model;
        if (isWritable(model, modelKey)) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          model[modelKey] = value;
        }
      }
    });
  }
}
