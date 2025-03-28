import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ReadonlyPartialJSONObject, Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';
import { JSONSchema7 } from 'json-schema';

import { IBaseCompleter } from './base-completer';

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
  chatModel?: IType<BaseChatModel>;
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
  currentName: string;
  /**
   * Get the current completer of the completion provider.
   */
  currentCompleter: IBaseCompleter | null;
  /**
   * Get the current llm chat model.
   */
  currentChatModel: BaseChatModel | null;
  /**
   * Get the settings schema of a given provider.
   */
  getSettingsSchema(provider: string): JSONSchema7;
  /**
   * Get the instructions of a given provider.
   */
  getInstructions(provider: string): string | undefined;
  /**
   * Format an error message from the current provider.
   */
  formatErrorMessage(error: any): string;
  /**
   * Set the providers (chat model and completer).
   * Creates the providers if the name has changed, otherwise only updates their config.
   *
   * @param options - an object with the name and the settings of the provider to use.
   */
  setProvider(options: ISetProviderOptions): void;
  /**
   * A signal emitting when the provider or its settings has changed.
   */
  readonly providerChanged: ISignal<IAIProviderRegistry, void>;
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
 * The set provider options.
 */
export interface ISetProviderOptions {
  /**
   * The name of the provider.
   */
  name: string;
  /**
   * The settings of the provider.
   */
  settings: ReadonlyPartialJSONObject;
}

/**
 * The provider registry token.
 */
export const IAIProviderRegistry = new Token<IAIProviderRegistry>(
  '@jupyterlite/ai:provider-registry',
  'Provider for chat and completion LLM provider'
);
