import { ISignal, Signal } from '@lumino/signaling';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import type { Model } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
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
  createChatModel(id: string, options: IModelOptions): Model | null {
    const provider = this._providers[id];
    if (!provider) {
      return null;
    }

    const languageModel = provider.factory(options);
    // wrap with aisdk for compatibility with the agent framework
    return aisdk(languageModel);
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
  ): LanguageModelV2 | null {
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
