import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ISignal, Signal } from '@lumino/signaling';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { JSONSchema7 } from 'json-schema';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { IBaseCompleter } from './base-completer';
import {
  getSecretId,
  SECRETS_NAMESPACE,
  SECRETS_REPLACEMENT
} from './settings';
import {
  IAIProvider,
  IAIProviderRegistry,
  IDict,
  ISetProviderOptions
} from './tokens';

export const chatSystemPrompt = (
  options: AIProviderRegistry.IPromptOptions
) => `
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
Only give raw strings back, do not format the response using backticks.
The output should be a single string, and should correspond to what a human users
would write.
Do not include the prompt in the output, only the string that should be appended to the current input.
`;

export class AIProviderRegistry implements IAIProviderRegistry {
  /**
   * The constructor of the provider registry.
   */
  constructor(options: AIProviderRegistry.IOptions) {
    this._secretsManager = options.secretsManager || null;
  }

  /**
   * Get the list of provider names.
   */
  get providers(): string[] {
    return Array.from(this._providers.keys());
  }

  /**
   * Add a new provider.
   */
  add(provider: IAIProvider): void {
    if (this._providers.has(provider.name)) {
      throw new Error(
        `A AI provider named '${provider.name}' is already registered`
      );
    }
    this._providers.set(provider.name, provider);

    // Set the provider if the loading has been deferred.
    if (provider.name === this._deferredProvider?.name) {
      this.setProvider(this._deferredProvider);
    }
  }

  /**
   * Get the current provider name.
   */
  get currentName(): string {
    return this._name;
  }

  /**
   * Get the current completer of the completion provider.
   */
  get currentCompleter(): IBaseCompleter | null {
    if (this._name === 'None') {
      return null;
    }
    return this._completer;
  }

  /**
   * Get the current llm chat model.
   */
  get currentChatModel(): BaseChatModel | null {
    if (this._name === 'None') {
      return null;
    }
    return this._chatModel;
  }

  /**
   * Get the settings schema of a given provider.
   */
  getSettingsSchema(provider: string): JSONSchema7 {
    return (this._providers.get(provider)?.settingsSchema?.properties ||
      {}) as JSONSchema7;
  }

  /**
   * Get the instructions of a given provider.
   */
  getInstructions(provider: string): string | undefined {
    return this._providers.get(provider)?.instructions;
  }

  /**
   * Format an error message from the current provider.
   */
  formatErrorMessage(error: any): string {
    if (this._currentProvider?.errorMessage) {
      return this._currentProvider?.errorMessage(error);
    }
    if (error.message) {
      return error.message;
    }
    return error;
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
   * Set the providers (chat model and completer).
   * Creates the providers if the name has changed, otherwise only updates their config.
   *
   * @param options - An object with the name and the settings of the provider to use.
   */
  async setProvider(options: ISetProviderOptions): Promise<void> {
    const { name, settings } = options;
    this._currentProvider = this._providers.get(name) ?? null;
    if (this._currentProvider === null) {
      // The current provider may not be loaded when the settings are first loaded.
      // Let's defer the provider loading.
      this._deferredProvider = options;
    } else {
      this._deferredProvider = null;
    }

    // Build a new settings object containing the secrets.
    const fullSettings: IDict = {};
    for (const key of Object.keys(settings)) {
      if (settings[key] === SECRETS_REPLACEMENT) {
        const id = getSecretId(name, key);
        const secrets = await this._secretsManager?.get(SECRETS_NAMESPACE, id);
        fullSettings[key] = secrets?.value || settings[key];
        continue;
      }
      fullSettings[key] = settings[key];
    }

    if (this._currentProvider?.completer !== undefined) {
      try {
        this._completer = new this._currentProvider.completer({
          ...fullSettings
        });
        this._completerError = '';
      } catch (e: any) {
        this._completerError = e.message;
      }
    } else {
      this._completer = null;
    }

    if (this._currentProvider?.chatModel !== undefined) {
      try {
        this._chatModel = new this._currentProvider.chatModel({
          ...fullSettings
        });
        this._chatError = '';
      } catch (e: any) {
        this._chatError = e.message;
        this._chatModel = null;
      }
    } else {
      this._chatModel = null;
    }
    this._name = name;
    this._providerChanged.emit();
  }

  /**
   * A signal emitting when the provider or its settings has changed.
   */
  get providerChanged(): ISignal<IAIProviderRegistry, void> {
    return this._providerChanged;
  }

  private _secretsManager: ISecretsManager | null;
  private _currentProvider: IAIProvider | null = null;
  private _completer: IBaseCompleter | null = null;
  private _chatModel: BaseChatModel | null = null;
  private _name: string = 'None';
  private _providerChanged = new Signal<IAIProviderRegistry, void>(this);
  private _chatError: string = '';
  private _completerError: string = '';
  private _providers = new Map<string, IAIProvider>();
  private _deferredProvider: ISetProviderOptions | null = null;
}

export namespace AIProviderRegistry {
  /**
   * The options for the LLM provider.
   */
  export interface IOptions {
    /**
     * The secrets manager used in the application.
     */
    secretsManager?: ISecretsManager;
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
