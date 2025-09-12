import { createAnthropic } from '@ai-sdk/anthropic';
import { createMistral } from '@ai-sdk/mistral';
import { aisdk } from '@openai/agents-extensions';
import { createOllama } from 'ollama-ai-provider-v2';

import type {
  IChatProviderInfo,
  ICompletionProviderInfo,
  IChatProviderRegistry,
  ICompletionProviderRegistry
} from '../tokens';
import type { IModelOptions } from './models';

/**
 * Register all built-in chat providers
 */
export function registerBuiltInChatProviders(
  registry: IChatProviderRegistry
): void {
  // Anthropic provider
  const anthropicInfo: IChatProviderInfo = {
    id: 'anthropic',
    name: 'Anthropic Claude',
    requiresApiKey: true,
    defaultModels: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-opus-4-1-20250805',
      'claude-3-5-haiku-latest'
    ],
    supportsBaseURL: true,
    supportsHeaders: true,
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for Anthropic');
      }
      const anthropic = createAnthropic({
        apiKey: options.apiKey,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
          ...options.headers
        },
        ...(options.baseURL && { baseURL: options.baseURL })
      });
      const modelName = options.model ?? '';
      return aisdk(anthropic(modelName));
    }
  };

  registry.registerProvider(anthropicInfo);

  // Mistral provider
  const mistralInfo: IChatProviderInfo = {
    id: 'mistral',
    name: 'Mistral AI',
    requiresApiKey: true,
    defaultModels: [
      'mistral-medium-latest',
      'mistral-large-latest',
      'mistral-small-latest',
      'codestral-latest'
    ],
    supportsBaseURL: true,
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for Mistral');
      }
      const mistral = createMistral({
        apiKey: options.apiKey,
        ...(options.baseURL && { baseURL: options.baseURL })
      });
      const modelName = options.model || 'mistral-large-latest';
      return aisdk(mistral(modelName));
    }
  };

  registry.registerProvider(mistralInfo);

  // Ollama provider
  const ollamaInfo: IChatProviderInfo = {
    id: 'ollama',
    name: 'Ollama',
    requiresApiKey: false,
    defaultModels: [],
    supportsBaseURL: true,
    supportsHeaders: true,
    factory: (options: IModelOptions) => {
      const ollama = createOllama({
        baseURL: options.baseURL || 'http://localhost:11434/api',
        ...(options.headers && { headers: options.headers })
      });
      const modelName = options.model || 'phi3';
      return aisdk(ollama(modelName));
    }
  };

  registry.registerProvider(ollamaInfo);
}

/**
 * Register all built-in completion providers
 */
export function registerBuiltInCompletionProviders(
  registry: ICompletionProviderRegistry
): void {
  // Anthropic provider
  const anthropicInfo: ICompletionProviderInfo = {
    id: 'anthropic',
    name: 'Anthropic Claude',
    requiresApiKey: true,
    defaultModels: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-opus-4-1-20250805',
      'claude-3-5-haiku-latest'
    ],
    supportsBaseURL: true,
    supportsHeaders: true,
    customSettings: {
      completionConfig: {
        temperature: 0.3,
        supportsFillInMiddle: false,
        useFilterText: true
      }
    },
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for Anthropic');
      }
      const anthropic = createAnthropic({
        apiKey: options.apiKey,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
          ...options.headers
        },
        ...(options.baseURL && { baseURL: options.baseURL })
      });
      const modelName = options.model ?? '';
      return anthropic(modelName);
    }
  };

  registry.registerProvider(anthropicInfo);

  // Mistral provider
  const mistralInfo: ICompletionProviderInfo = {
    id: 'mistral',
    name: 'Mistral AI',
    requiresApiKey: true,
    defaultModels: [
      'mistral-medium-latest',
      'mistral-large-latest',
      'mistral-small-latest',
      'codestral-latest'
    ],
    supportsBaseURL: true,
    customSettings: {
      completionConfig: {
        temperature: 0.2,
        supportsFillInMiddle: true,
        customPromptFormat: (prompt: string, suffix: string) => {
          return suffix.trim() ? `<PRE>${prompt}<SUF>${suffix}<MID>` : prompt;
        },
        cleanupCompletion: (completion: string) => {
          return completion
            .replace(/<PRE>/g, '')
            .replace(/<SUF>/g, '')
            .replace(/<MID>/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .trim();
        },
        useFilterText: false
      }
    },
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for Mistral');
      }
      const mistral = createMistral({
        apiKey: options.apiKey,
        ...(options.baseURL && { baseURL: options.baseURL })
      });
      const modelName = options.model || 'mistral-large-latest';
      return mistral(modelName);
    }
  };

  registry.registerProvider(mistralInfo);

  // Ollama provider
  const ollamaInfo: ICompletionProviderInfo = {
    id: 'ollama',
    name: 'Ollama',
    requiresApiKey: false,
    defaultModels: ['phi3'],
    supportsBaseURL: true,
    supportsHeaders: true,
    customSettings: {
      completionConfig: {
        temperature: 0.3,
        supportsFillInMiddle: false,
        useFilterText: false
      }
    },
    factory: (options: IModelOptions) => {
      const ollama = createOllama({
        baseURL: options.baseURL || 'http://localhost:11434/api',
        ...(options.headers && { headers: options.headers })
      });
      const modelName = options.model || 'phi3';
      return ollama(modelName);
    }
  };

  registry.registerProvider(ollamaInfo);
}
