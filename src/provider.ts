import { Notification } from '@jupyterlab/apputils';
import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { Debouncer } from '@lumino/polling';
import { ISignal, Signal } from '@lumino/signaling';
import { JSONSchema7 } from 'json-schema';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { IBaseCompleter } from './base-completer';
import { getSecretId, SECRETS_REPLACEMENT } from './settings';
import {
  IAIProvider,
  IAIProviderRegistry,
  IDict,
  ModelRole,
  PLUGIN_IDS
} from './tokens';
import { AIChatModel, AICompleter } from './types/ai-model';

const SECRETS_NAMESPACE = PLUGIN_IDS.providerRegistry;
const NOTIFICATION_DELAY = 2000;

export class AIProviderRegistry implements IAIProviderRegistry {
  /**
   * The constructor of the provider registry.
   */
  constructor(options: AIProviderRegistry.IOptions) {
    this._secretsManager = options.secretsManager || null;
    Private.setToken(options.token);

    this._notifications = {
      chat: new Debouncer(this._emitErrorNotification, NOTIFICATION_DELAY),
      completer: new Debouncer(this._emitErrorNotification, NOTIFICATION_DELAY)
    };
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

    // Set the providers if the loading has been deferred.
    if (provider.name === this._deferredProvider.completer?.name) {
      this.setCompleterProvider(this._deferredProvider.completer);
    }
    if (provider.name === this._deferredProvider.chat?.name) {
      this.setChatProvider(this._deferredProvider.chat);
    }
  }

  /**
   * Get the current provider name.
   */
  currentName(role: ModelRole): string {
    return Private.getName(role);
  }

  /**
   * Get the current AICompleter.
   */
  get currentCompleter(): AICompleter | null {
    if (Private.getName('completer') === 'None') {
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
   * Getter/setter for the completer system prompt.
   */
  get completerSystemPrompt(): string {
    return this._completerPrompt.replaceAll(
      '$provider_name$',
      this.currentName('completer')
    );
  }
  set completerSystemPrompt(value: string) {
    this._completerPrompt = value;
  }

  /**
   * Get the current AIChatModel.
   */
  get currentChatModel(): AIChatModel | null {
    if (Private.getName('chat') === 'None') {
      return null;
    }
    const currentProvider =
      Private.providers.get(Private.getName('chat')) ?? null;

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
   * Getter/setter for the chat system prompt.
   */
  get chatSystemPrompt(): string {
    return this._chatPrompt.replaceAll(
      '$provider_name$',
      this.currentName('chat')
    );
  }
  set chatSystemPrompt(value: string) {
    this._chatPrompt = value;
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
    const currentProvider =
      Private.providers.get(Private.getName('chat')) ?? null;
    if (currentProvider?.errorMessage) {
      return currentProvider?.errorMessage(error);
    }
    if (error.message) {
      return error.message;
    }
    return error;
  }

  /**
   * Get/set the current chat error;
   */
  get chatError(): string {
    return this._chatError;
  }
  private set chatError(error: string) {
    this._chatError = error;
    if (error !== '') {
      this._notifications.chat.invoke(`Chat: ${error}`);
    }
  }

  /**
   * Get/set the current completer error.
   */
  get completerError(): string {
    return this._completerError;
  }
  private set completerError(error: string) {
    this._completerError = error;
    if (error !== '') {
      this._notifications.completer.invoke(`Completer: ${error}`);
    }
  }

  /**
   * A function to emit a notification error.
   */
  private _emitErrorNotification(error: string) {
    Notification.emit(error, 'error', {
      autoClose: NOTIFICATION_DELAY
    });
  }

  /**
   * Set the completer provider.
   * Creates the provider if the name has changed, otherwise only updates its config.
   *
   * @param options - An object with the name and the settings of the provider to use.
   */
  async setCompleterProvider(
    settings: ReadonlyPartialJSONObject
  ): Promise<void> {
    this.completerError = '';
    if (!Object.keys(settings).includes('provider')) {
      Private.setName('completer', 'None');
      Private.setCompleter(null);
      this.completerError =
        'The provider is missing from the completer settings';
      return;
    }
    const provider = settings['provider'] as string;
    const currentProvider = Private.providers.get(provider) ?? null;
    if (currentProvider === null) {
      // The current provider may not be loaded when the settings are first loaded.
      // Let's defer the provider loading.
      this._deferredProvider.completer = settings;
      Private.setName('completer', provider);
      Private.setCompleter(null);
      return;
    } else {
      this._deferredProvider.completer = null;
    }

    const compatibilityCheck = this.getCompatibilityCheck(provider);
    if (compatibilityCheck !== undefined) {
      const error = await compatibilityCheck();
      if (error !== null) {
        this.completerError = error.trim();
        Private.setName('completer', 'None');
        this._providerChanged.emit('completer');
        return;
      }
    }

    // Get the settings including the secrets.
    const fullSettings = await this._buildFullSettings(provider, settings);

    if (currentProvider?.completer !== undefined) {
      try {
        Private.setCompleter(
          new currentProvider.completer({
            providerRegistry: this,
            settings: fullSettings
          })
        );
      } catch (e: any) {
        this.completerError = e.message;
      }
    } else {
      Private.setCompleter(null);
    }
    Private.setName('completer', provider);
    this._providerChanged.emit('completer');
  }

  /**
   * Set the chat provider.
   * Creates the provider if the name has changed, otherwise only updates its config.
   *
   * @param options - An object with the name and the settings of the provider to use.
   */
  async setChatProvider(settings: ReadonlyPartialJSONObject): Promise<void> {
    this.chatError = '';
    if (!Object.keys(settings).includes('provider')) {
      Private.setName('chat', 'None');
      Private.setChatModel(null);
      this.chatError = 'The provider is missing from the chat settings';
      return;
    }
    const provider = settings['provider'] as string;
    const currentProvider = Private.providers.get(provider) ?? null;
    if (currentProvider === null) {
      // The current provider may not be loaded when the settings are first loaded.
      // Let's defer the provider loading.
      this._deferredProvider.chat = settings;
      Private.setName('chat', provider);
      Private.setChatModel(null);
      return;
    } else {
      this._deferredProvider.chat = null;
    }

    const compatibilityCheck = this.getCompatibilityCheck(provider);
    if (compatibilityCheck !== undefined) {
      const error = await compatibilityCheck();
      if (error !== null) {
        this.chatError = error.trim();
        Private.setName('chat', 'None');
        this._providerChanged.emit('chat');
        return;
      }
    }

    // Get the settings including the secrets.
    const fullSettings = await this._buildFullSettings(provider, settings);

    if (currentProvider?.chat !== undefined) {
      try {
        Private.setChatModel(
          new currentProvider.chat({
            ...fullSettings
          })
        );
      } catch (e: any) {
        this.chatError = e.message;
        Private.setChatModel(null);
      }
    } else {
      Private.setChatModel(null);
    }
    Private.setName('chat', provider);
    this._providerChanged.emit('chat');
  }

  /**
   * A signal emitting when the provider or its settings has changed.
   */
  get providerChanged(): ISignal<IAIProviderRegistry, ModelRole> {
    return this._providerChanged;
  }

  /**
   * Build a new settings object containing the secrets.
   */
  private async _buildFullSettings(
    name: string,
    settings: IDict<any>
  ): Promise<IDict<any>> {
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
    return fullSettings;
  }

  private _secretsManager: ISecretsManager | null;
  private _providerChanged = new Signal<IAIProviderRegistry, ModelRole>(this);
  private _chatError: string = '';
  private _completerError: string = '';
  private _notifications: {
    [key in ModelRole]: Debouncer;
  };
  private _deferredProvider: {
    [key in ModelRole]: ReadonlyPartialJSONObject | null;
  } = {
    chat: null,
    completer: null
  };
  private _chatPrompt: string = '';
  private _completerPrompt: string = '';
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
  const names: { [key in ModelRole]: string } = {
    chat: 'None',
    completer: 'None'
  };
  export function setName(role: ModelRole, value: string): void {
    names[role] = value;
  }
  export function getName(role: ModelRole): string {
    return names[role];
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
