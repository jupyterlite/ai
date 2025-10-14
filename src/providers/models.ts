import type { LanguageModelV2 } from '@ai-sdk/provider';
import type { IProviderRegistry } from '../tokens';

/**
 * Configuration options for creating language models.
 */
export interface IModelOptions {
  /**
   * The provider name (e.g., 'openai', 'anthropic', 'huggingface')
   */
  provider: string;

  /**
   * The specific model name. If not provided, uses provider's default model
   */
  model?: string;

  /**
   * API key for authentication with the provider
   */
  apiKey?: string;

  /**
   * Additional HTTP headers to send with requests
   */
  headers?: Record<string, string>;

  /**
   * Custom base URL for the provider's API endpoint
   */
  baseURL?: string;
}

/**
 * Create a completion model using the provider registry.
 * Built-in providers are automatically registered during extension initialization.
 */
export function createCompletionModel(
  options: IModelOptions,
  registry?: IProviderRegistry
): LanguageModelV2 {
  if (!registry) {
    throw new Error('Provider registry not available');
  }

  const model = registry.createCompletionModel(options.provider, options);
  if (!model) {
    throw new Error(
      `Provider ${options.provider} not found or failed to create model`
    );
  }

  return model;
}

/**
 * Create a chat model using the provider registry.
 * Built-in providers are automatically registered during extension initialization.
 */
export function createModel(
  options: IModelOptions,
  registry?: IProviderRegistry
) {
  if (!registry) {
    throw new Error('Provider registry not available');
  }

  const model = registry.createChatModel(options.provider, options);
  if (!model) {
    throw new Error(
      `Provider ${options.provider} not found or failed to create model`
    );
  }

  return model;
}
