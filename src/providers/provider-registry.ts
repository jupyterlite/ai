import { ISignal, Signal } from '@lumino/signaling';
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
    this._providers[info.id] = { ...info };
    this._factories[info.id] = info.factory;
    this._providersChanged.emit();
  }

  /**
   * Unregister a chat provider by ID
   * @param id Provider ID to remove
   * @returns true if provider was found and removed, false otherwise
   */
  unregisterProvider(id: string): boolean {
    if (id in this._providers) {
      delete this._providers[id];
      delete this._factories[id];
      this._providersChanged.emit();
      return true;
    }
    return false;
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
  createChatModel(id: string, options: IModelOptions): any | null {
    const factory = this._factories[id];
    if (!factory) {
      return null;
    }

    try {
      return factory(options);
    } catch (error) {
      console.error(`Failed to create chat model for provider ${id}:`, error);
      return null;
    }
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
    this._providers[info.id] = { ...info };
    this._factories[info.id] = info.factory;
    this._providersChanged.emit();
  }

  /**
   * Unregister a completion provider by ID
   * @param id Provider ID to remove
   * @returns true if provider was found and removed, false otherwise
   */
  unregisterProvider(id: string): boolean {
    if (id in this._providers) {
      delete this._providers[id];
      delete this._factories[id];
      this._providersChanged.emit();
      return true;
    }
    return false;
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

    try {
      return factory(options);
    } catch (error) {
      console.error(
        `Failed to create completion model for provider ${id}:`,
        error
      );
      return null;
    }
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
