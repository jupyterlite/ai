import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ReadonlyPartialJSONObject, Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';
import { JSONSchema7 } from 'json-schema';

import { IBaseCompleter } from './base-completer';
import { AIChatModel, AICompleter } from './types/ai-model';

export const PLUGIN_IDS = {
  chat: '@jupyterlite/ai:chat',
  chatCommandRegistry: '@jupyterlite/ai:autocompletion-registry',
  completer: '@jupyterlite/ai:completer',
  providerRegistry: '@jupyterlite/ai:provider-registry',
  settingsConnector: '@jupyterlite/ai:settings-connector',
  systemPrompts: '@jupyterlite/ai:system-prompts'
};

export type ModelRole = 'chat' | 'completer';

export interface IDict<T = any> {
  [key: string]: T;
}

export interface IType<T> {
  new (...args: any[]): T;
}

/**
 * The provider interface.
 */
export interface IAIProvider {
  /**
   * The name of the provider.
   */
  name: string;
  /**
   * The chat model class to use.
   */
  chat?: IType<BaseChatModel>;
  /**
   * The completer class to use.
   */
  completer?: IType<IBaseCompleter>;
  /**
   * the settings schema for the provider.
   */
  settingsSchema?: any;
  /**
   * The instructions to be displayed in the settings, as helper to use the provider.
   * A markdown renderer is used to render the instructions.
   */
  instructions?: string;
  /**
   * A function that extract the error message from the provider API error.
   * Default to `(error) => error.message`.
   */
  errorMessage?: (error: any) => string;
  /**
   * Compatibility check function, to determine if the provider is compatible with the
   * current environment.
   */
  compatibilityCheck?: () => Promise<string | null>;
  /**
   * Whether to expose or not the chat model.
   *
   * ### CAUTION
   * This flag will expose the whole chat model API, which may contain private keys.
   * Be sure to use it with a model that does not expose sensitive information in the
   * API.
   */
  exposeChatModel?: boolean;
}

/**
 * The provider registry interface.
 */
export interface IAIProviderRegistry {
  /**
   * Get the list of provider names.
   */
  readonly providers: string[];
  /**
   * Add a new provider.
   */
  add(provider: IAIProvider): void;
  /**
   * Get the current provider name.
   */
  currentName(role: ModelRole): string;
  /**
   * Get the current completer of the completion provider.
   */
  currentCompleter: AICompleter | null;
  /**
   * Getter/setter for the completer system prompt.
   */
  completerSystemPrompt: string;
  /**
   * Get the current llm chat model.
   */
  currentChatModel: AIChatModel | null;
  /**
   * Getter/setter for the chat system prompt.
   */
  chatSystemPrompt: string;
  /**
   * Get the settings schema of a given provider.
   */
  getSettingsSchema(provider: string): JSONSchema7;
  /**
   * Get the instructions of a given provider.
   */
  getInstructions(provider: string): string | undefined;
  /**
   * Get the compatibility check function of a given provider.
   */
  getCompatibilityCheck(
    provider: string
  ): (() => Promise<string | null>) | undefined;
  /**
   * Format an error message from the current provider.
   */
  formatErrorMessage(error: any): string;
  /**
   * Set the completer provider.
   * Creates the provider if the name has changed, otherwise only updates its config.
   *
   * @param options - An object with the name and the settings of the provider to use.
   */
  setCompleterProvider(settings: ReadonlyPartialJSONObject): void;
  /**
   * Set the chat provider.
   * Creates the provider if the name has changed, otherwise only updates its config.
   *
   * @param options - An object with the name and the settings of the provider to use.
   */
  setChatProvider(settings: ReadonlyPartialJSONObject): void;
  /**
   * A signal emitting when the provider or its settings has changed.
   */
  readonly providerChanged: ISignal<IAIProviderRegistry, ModelRole>;
  /**
   * Get the current chat error;
   */
  readonly chatError: string;
  /**
   * get the current completer error.
   */
  readonly completerError: string;
}

/**
 * The provider registry token.
 */
export const IAIProviderRegistry = new Token<IAIProviderRegistry>(
  '@jupyterlite/ai:provider-registry',
  'Provider for chat and completion LLM provider'
);
