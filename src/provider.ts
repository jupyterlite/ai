import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ISignal, Signal } from '@lumino/signaling';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { JSONSchema7 } from 'json-schema';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { IBaseCompleter } from './base-completer';
import { getSecretId, SECRETS_REPLACEMENT } from './settings';
import {
  IAIProvider,
  IAIProviderRegistry,
  IDict,
  ISetProviderOptions,
  PLUGIN_IDS
} from './tokens';
import { AIChatModel, AICompleter } from './types/ai-model';

const SECRETS_NAMESPACE = PLUGIN_IDS.providerRegistry;

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
The output should be a single string, and should only contain the code that will complete the
give code passed as input, no explanation whatsoever.
Do not include the prompt in the output, only the string that should be appended to the current input.
Here is the code to complete:
`;

export class AIProviderRegistry implements IAIProviderRegistry {
  /**
   * The constructor of the provider registry.
   */
  constructor(options: AIProviderRegistry.IOptions) {
    this._secretsManager = options.secretsManager || null;
    Private.setToken(options.token);
  }

  /**
   * Get the list of provider names.
   */
  get providers(): string[] {
    return Array.from(Private.providers.keys());
  }

  /**
   * Add a new provider.
   */
  add(provider: IAIProvider): void {
    if (Private.providers.has(provider.name)) {
      throw new Error(
        `A AI provider named '${provider.name}' is already registered`
      );
    }
    Private.providers.set(provider.name, provider);

    // Set the provider if the loading has been deferred.
    if (provider.name === this._deferredProvider?.name) {
      this.setProvider(this._deferredProvider);
    }
  }

  /**
   * Get the current provider name.
   */
  get currentName(): string {
    return Private.getName();
  }

  /**
   * Get the current AICompleter.
   */
  get currentCompleter(): AICompleter | null {
    if (Private.getName() === 'None') {
      return null;
    }
    const completer = Private.getCompleter();
    if (completer === null) {
      return null;
    }
    return {
      fetch: (
        request: CompletionHandler.IRequest,
        context: IInlineCompletionContext
      ) => completer.fetch(request, context)
    };
  }

  /**
   * Get the current AIChatModel.
   */
  get currentChatModel(): AIChatModel | null {
    if (Private.getName() === 'None') {
      return null;
    }
    const currentProvider = Private.providers.get(Private.getName()) ?? null;

    const chatModel = Private.getChatModel();
    if (chatModel === null) {
      return null;
    }
    if (currentProvider?.exposeChatModel ?? false) {
      // Expose the full chat model if expected.
      return chatModel as AIChatModel;
    }

    // Otherwise, we create a reduced AIChatModel interface.
    return {
      stream: (input: any, options?: any) => chatModel.stream(input, options)
    };
  }

  /**
   * Get the settings schema of a given provider.
   */
  getSettingsSchema(provider: string): JSONSchema7 {
    return (Private.providers.get(provider)?.settingsSchema?.properties ||
      {}) as JSONSchema7;
  }

  /**
   * Get the instructions of a given provider.
   */
  getInstructions(provider: string): string | undefined {
    return Private.providers.get(provider)?.instructions;
  }

  /**
   * Get the compatibility check function of a given provider.
   */
  getCompatibilityCheck(
    provider: string
  ): (() => Promise<string | null>) | undefined {
    return Private.providers.get(provider)?.compatibilityCheck;
  }

  /**
   * Format an error message from the current provider.
   */
  formatErrorMessage(error: any): string {
    const currentProvider = Private.providers.get(Private.getName()) ?? null;
    if (currentProvider?.errorMessage) {
      return currentProvider?.errorMessage(error);
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
   * Get the current completer error.
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
    const currentProvider = Private.providers.get(name) ?? null;
    if (currentProvider === null) {
      // The current provider may not be loaded when the settings are first loaded.
      // Let's defer the provider loading.
      this._deferredProvider = options;
    } else {
      this._deferredProvider = null;
    }

    const compatibilityCheck = this.getCompatibilityCheck(name);
    if (compatibilityCheck !== undefined) {
      const error = await compatibilityCheck();
      if (error !== null) {
        this._chatError = error.trim();
        this._completerError = error.trim();
        Private.setName('None');
        this._providerChanged.emit();
        return;
      }
    }

    if (name === 'None') {
      this._chatError = '';
      this._completerError = '';
    }

    // Build a new settings object containing the secrets.
    const fullSettings: IDict = {};
    for (const key of Object.keys(settings)) {
      if (settings[key] === SECRETS_REPLACEMENT) {
        const id = getSecretId(name, key);
        const secrets = await this._secretsManager?.get(
          Private.getToken(),
          SECRETS_NAMESPACE,
          id
        );
        if (secrets !== undefined) {
          fullSettings[key] = secrets.value;
        }
        continue;
      }
      fullSettings[key] = settings[key];
    }

    if (currentProvider?.completer !== undefined) {
      try {
        Private.setCompleter(
          new currentProvider.completer({
            settings: fullSettings
          })
        );
        this._completerError = '';
      } catch (e: any) {
        this._completerError = e.message;
      }
    } else {
      Private.setCompleter(null);
    }

    if (currentProvider?.chatModel !== undefined) {
      try {
        Private.setChatModel(
          new currentProvider.chatModel({
            ...fullSettings
          })
        );
        this._chatError = '';
      } catch (e: any) {
        this._chatError = e.message;
        Private.setChatModel(null);
      }
    } else {
      Private.setChatModel(null);
    }
    Private.setName(name);
    this._providerChanged.emit();
  }

  /**
   * A signal emitting when the provider or its settings has changed.
   */
  get providerChanged(): ISignal<IAIProviderRegistry, void> {
    return this._providerChanged;
  }

  private _secretsManager: ISecretsManager | null;
  private _providerChanged = new Signal<IAIProviderRegistry, void>(this);
  private _chatError: string = '';
  private _completerError: string = '';
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
    /**
     * The token used to request the secrets manager.
     */
    token: symbol;
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

namespace Private {
  /**
   * The token to use with the secrets manager, setter and getter.
   */
  let secretsToken: symbol;
  export function setToken(value: symbol): void {
    secretsToken = value;
  }
  export function getToken(): symbol {
    return secretsToken;
  }

  /**
   * The providers map, in private namespace to prevent updating the 'exposeChatModel'
   * flag.
   */
  export const providers = new Map<string, IAIProvider>();

  /**
   * The name of the current provider, setter and getter.
   * It is in a private namespace to prevent updating it without updating the models.
   */
  let name: string = 'None';
  export function setName(value: string): void {
    name = value;
  }
  export function getName(): string {
    return name;
  }

  /**
   * The chat model setter and getter.
   */
  let chatModel: BaseChatModel | null = null;
  export function setChatModel(model: BaseChatModel | null): void {
    chatModel = model;
  }
  export function getChatModel(): BaseChatModel | null {
    return chatModel;
  }

  /**
   * The completer setter and getter.
   */
  let completer: IBaseCompleter | null = null;
  export function setCompleter(model: IBaseCompleter | null): void {
    completer = model;
  }
  export function getCompleter(): IBaseCompleter | null {
    return completer;
  }
}
