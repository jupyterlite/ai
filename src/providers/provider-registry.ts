import { ISignal, Signal } from '@lumino/signaling';
import type { Model } from '@openai/agents';
import type { LanguageModel } from 'ai';
import type { IModelOptions } from './models';
import {
  IChatProviderFactory,
  IChatProviderInfo,
  IChatProviderRegistry,
  ICompletionProviderFactory,
  ICompletionProviderInfo,
  ICompletionProviderRegistry
} from '../tokens';

/**
 * Implementation of the chat provider registry
 */
export class ChatProviderRegistry implements IChatProviderRegistry {
  /**
   * Get a copy of all registered providers
   */
  get providers(): Record<string, IChatProviderInfo> {
    return { ...this._providers };
  }

  /**
   * Signal emitted when providers are added or removed
   */
  get providersChanged(): ISignal<IChatProviderRegistry, void> {
    return this._providersChanged;
  }

  /**
   * Register a new chat provider
   * @param info Provider information including factory
   */
  registerProvider(info: IChatProviderInfo): void {
    if (info.id in this._providers) {
      throw new Error(`Provider with id "${info.id}" is already registered`);
    }
    this._providers[info.id] = { ...info };
    this._factories[info.id] = info.factory;
    this._providersChanged.emit();
  }

  /**
   * Get provider information by ID
   * @param id Provider ID
   * @returns Provider info or null if not found
   */
  getProviderInfo(id: string): IChatProviderInfo | null {
    return this._providers[id] || null;
  }

  /**
   * Create a chat model instance using the specified provider
   * @param id Provider ID
   * @param options Model configuration options
   * @returns Chat model instance or null if creation fails
   */
  createChatModel(id: string, options: IModelOptions): Model | null {
    const factory = this._factories[id];
    if (!factory) {
      return null;
    }

    return factory(options);
  }

  /**
   * Get list of all available provider IDs
   * @returns Array of provider IDs
   */
  getAvailableProviders(): string[] {
    return Object.keys(this._providers);
  }

  private _providers: Record<string, IChatProviderInfo> = {};
  private _factories: Record<string, IChatProviderFactory> = {};
  private _providersChanged = new Signal<IChatProviderRegistry, void>(this);
}

/**
 * Implementation of the completion provider registry
 */
export class CompletionProviderRegistry implements ICompletionProviderRegistry {
  /**
   * Get a copy of all registered providers
   */
  get providers(): Record<string, ICompletionProviderInfo> {
    return { ...this._providers };
  }

  /**
   * Signal emitted when providers are added or removed
   */
  get providersChanged(): ISignal<ICompletionProviderRegistry, void> {
    return this._providersChanged;
  }

  /**
   * Register a new completion provider
   * @param info Provider information including factory
   */
  registerProvider(info: ICompletionProviderInfo): void {
    if (info.id in this._providers) {
      throw new Error(`Provider with id "${info.id}" is already registered`);
    }
    this._providers[info.id] = { ...info };
    this._factories[info.id] = info.factory;
    this._providersChanged.emit();
  }

  /**
   * Get provider information by ID
   * @param id Provider ID
   * @returns Provider info or null if not found
   */
  getProviderInfo(id: string): ICompletionProviderInfo | null {
    return this._providers[id] || null;
  }

  /**
   * Create a completion model instance using the specified provider
   * @param id Provider ID
   * @param options Model configuration options
   * @returns Language model instance or null if creation fails
   */
  createCompletionModel(
    id: string,
    options: IModelOptions
  ): LanguageModel | null {
    const factory = this._factories[id];
    if (!factory) {
      return null;
    }

    return factory(options);
  }

  /**
   * Get list of all available provider IDs
   * @returns Array of provider IDs
   */
  getAvailableProviders(): string[] {
    return Object.keys(this._providers);
  }

  private _providers: Record<string, ICompletionProviderInfo> = {};
  private _factories: Record<string, ICompletionProviderFactory> = {};
  private _providersChanged = new Signal<ICompletionProviderRegistry, void>(
    this
  );
}
