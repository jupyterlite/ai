import { ISignal, Signal } from '@lumino/signaling';
import type { LanguageModel } from 'ai';
import type { IModelOptions } from './models';
import { IProviderInfo, IProviderRegistry } from '../tokens';

/**
 * Implementation of the provider registry
 */
export class ProviderRegistry implements IProviderRegistry {
  /**
   * Get a copy of all registered providers
   */
  get providers(): Record<string, IProviderInfo> {
    return { ...this._providers };
  }

  /**
   * Signal emitted when providers are added or removed
   */
  get providersChanged(): ISignal<IProviderRegistry, void> {
    return this._providersChanged;
  }

  /**
   * Register a new provider
   * @param info Provider information with factories for chat and completion
   */
  registerProvider(info: IProviderInfo): void {
    if (info.id in this._providers) {
      throw new Error(`Provider with id "${info.id}" is already registered`);
    }
    this._providers[info.id] = { ...info };
    this._providersChanged.emit();
  }

  /**
   * Get provider information by ID
   * @param id Provider ID
   * @returns Provider info or null if not found
   */
  getProviderInfo(id: string): IProviderInfo | null {
    return this._providers[id] || null;
  }

  /**
   * Create a chat model instance using the specified provider
   * @param id Provider ID
   * @param options Model configuration options
   * @returns Chat model instance or null if creation fails
   */
  createChatModel(id: string, options: IModelOptions): LanguageModel | null {
    const provider = this._providers[id];
    if (!provider) {
      return null;
    }

    return provider.factory(options);
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
    const provider = this._providers[id];
    if (!provider) {
      return null;
    }

    return provider.factory(options);
  }

  /**
   * Get list of all available provider IDs
   * @returns Array of provider IDs
   */
  getAvailableProviders(): string[] {
    return Object.keys(this._providers);
  }

  private _providers: Record<string, IProviderInfo> = {};
  private _providersChanged = new Signal<IProviderRegistry, void>(this);
}
