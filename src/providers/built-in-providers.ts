import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
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
    apiKeyRequirement: 'required',
    defaultModels: [
      'claude-sonnet-4-5',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-1',
      'claude-opus-4-0',
      'claude-sonnet-4-0',
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-latest',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-latest',
      'claude-3-5-haiku-20241022',
      'claude-3-haiku-20240307'
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

  // Google Generative AI provider
  const googleInfo: IChatProviderInfo = {
    id: 'google',
    name: 'Google Generative AI',
    apiKeyRequirement: 'required',
    defaultModels: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash-lite-preview-09-2025',
      'gemini-2.5-flash-preview-04-17',
      'gemini-2.5-flash-preview-09-2025',
      'gemini-2.5-pro-exp-03-25',
      'gemini-2.0-flash',
      'gemini-2.0-flash-001',
      'gemini-2.0-flash-live-001',
      'gemini-2.0-flash-lite',
      'gemini-2.0-pro-exp-02-05',
      'gemini-2.0-flash-thinking-exp-01-21',
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-001',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-8b',
      'gemini-1.5-flash-8b-latest',
      'gemini-1.5-flash-8b-001',
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-1.5-pro-001',
      'gemini-1.5-pro-002',
      'gemini-exp-1206',
      'gemma-3-12b-it',
      'gemma-3-27b-it'
    ],
    supportsBaseURL: true,
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for Google Generative AI');
      }
      const google = createGoogleGenerativeAI({
        apiKey: options.apiKey,
        ...(options.baseURL && { baseURL: options.baseURL })
      });
      const modelName = options.model || 'gemini-2.5-flash';
      return aisdk(google(modelName));
    }
  };

  registry.registerProvider(googleInfo);

  // Mistral provider
  const mistralInfo: IChatProviderInfo = {
    id: 'mistral',
    name: 'Mistral AI',
    apiKeyRequirement: 'required',
    defaultModels: [
      'ministral-3b-latest',
      'ministral-8b-latest',
      'mistral-large-latest',
      'mistral-medium-latest',
      'mistral-medium-2508',
      'mistral-medium-2505',
      'mistral-small-latest',
      'pixtral-large-latest',
      'magistral-small-2507',
      'magistral-medium-2507',
      'magistral-small-2506',
      'magistral-medium-2506',
      'pixtral-12b-2409',
      'open-mistral-7b',
      'open-mixtral-8x7b',
      'open-mixtral-8x22b'
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

  // OpenAI provider
  const openaiInfo: IChatProviderInfo = {
    id: 'openai',
    name: 'OpenAI',
    apiKeyRequirement: 'required',
    defaultModels: [
      'o1',
      'o1-2024-12-17',
      'o3-mini',
      'o3-mini-2025-01-31',
      'o3',
      'o3-2025-04-16',
      'gpt-4.1',
      'gpt-4.1-2025-04-14',
      'gpt-4.1-mini',
      'gpt-4.1-mini-2025-04-14',
      'gpt-4.1-nano',
      'gpt-4.1-nano-2025-04-14',
      'gpt-4o',
      'gpt-4o-2024-05-13',
      'gpt-4o-2024-08-06',
      'gpt-4o-2024-11-20',
      'gpt-4o-mini',
      'gpt-4o-mini-2024-07-18',
      'gpt-4-turbo',
      'gpt-4-turbo-2024-04-09',
      'gpt-4',
      'gpt-4-0613',
      'gpt-4.5-preview',
      'gpt-4.5-preview-2025-02-27',
      'gpt-3.5-turbo-0125',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-1106',
      'chatgpt-4o-latest',
      'gpt-5',
      'gpt-5-2025-08-07',
      'gpt-5-mini',
      'gpt-5-mini-2025-08-07',
      'gpt-5-nano',
      'gpt-5-nano-2025-08-07',
      'gpt-5-chat-latest'
    ],
    supportsBaseURL: true,
    supportsHeaders: true,
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for OpenAI');
      }
      const openai = createOpenAI({
        apiKey: options.apiKey,
        ...(options.baseURL && { baseURL: options.baseURL }),
        ...(options.headers && { headers: options.headers })
      });
      const modelName = options.model || 'gpt-4o';
      return aisdk(openai(modelName));
    }
  };

  registry.registerProvider(openaiInfo);

  // Ollama provider
  const ollamaInfo: IChatProviderInfo = {
    id: 'ollama',
    name: 'Ollama',
    apiKeyRequirement: 'none',
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

  // Generic OpenAI-compatible provider
  const genericInfo: IChatProviderInfo = {
    id: 'generic',
    name: 'Generic (OpenAI-compatible)',
    apiKeyRequirement: 'optional',
    defaultModels: [],
    supportsBaseURL: true,
    supportsHeaders: true,
    supportsToolCalling: true,
    description: 'Uses /chat/completions endpoint',
    factory: (options: IModelOptions) => {
      const openai = createOpenAI({
        apiKey: options.apiKey || 'dummy',
        ...(options.baseURL && { baseURL: options.baseURL }),
        ...(options.headers && { headers: options.headers })
      });
      const modelName = options.model || 'gpt-4o';
      // explicitly use openai.chat to ensure we use the /chat/completions endpoint
      // for use with LiteLLM and other OpenAI-compatible providers
      return aisdk(openai.chat(modelName));
    }
  };

  registry.registerProvider(genericInfo);
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
    apiKeyRequirement: 'required',
    defaultModels: [
      'claude-sonnet-4-5',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-1',
      'claude-opus-4-0',
      'claude-sonnet-4-0',
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-latest',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-latest',
      'claude-3-5-haiku-20241022',
      'claude-3-haiku-20240307'
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

  // Google Generative AI provider
  const googleCompletionInfo: ICompletionProviderInfo = {
    id: 'google',
    name: 'Google Generative AI',
    apiKeyRequirement: 'required',
    defaultModels: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash-lite-preview-09-2025',
      'gemini-2.5-flash-preview-04-17',
      'gemini-2.5-flash-preview-09-2025',
      'gemini-2.5-pro-exp-03-25',
      'gemini-2.0-flash',
      'gemini-2.0-flash-001',
      'gemini-2.0-flash-live-001',
      'gemini-2.0-flash-lite',
      'gemini-2.0-pro-exp-02-05',
      'gemini-2.0-flash-thinking-exp-01-21',
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-001',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-8b',
      'gemini-1.5-flash-8b-latest',
      'gemini-1.5-flash-8b-001',
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-1.5-pro-001',
      'gemini-1.5-pro-002',
      'gemini-exp-1206',
      'gemma-3-12b-it',
      'gemma-3-27b-it'
    ],
    supportsBaseURL: true,
    customSettings: {
      completionConfig: {
        temperature: 0.3,
        supportsFillInMiddle: false,
        useFilterText: true
      }
    },
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for Google Generative AI');
      }
      const google = createGoogleGenerativeAI({
        apiKey: options.apiKey,
        ...(options.baseURL && { baseURL: options.baseURL })
      });
      const modelName = options.model || 'gemini-2.5-flash';
      return google(modelName);
    }
  };

  registry.registerProvider(googleCompletionInfo);

  // Mistral provider
  const mistralInfo: ICompletionProviderInfo = {
    id: 'mistral',
    name: 'Mistral AI',
    apiKeyRequirement: 'required',
    defaultModels: [
      'ministral-3b-latest',
      'ministral-8b-latest',
      'mistral-large-latest',
      'mistral-medium-latest',
      'mistral-medium-2508',
      'mistral-medium-2505',
      'mistral-small-latest',
      'pixtral-large-latest',
      'magistral-small-2507',
      'magistral-medium-2507',
      'magistral-small-2506',
      'magistral-medium-2506',
      'pixtral-12b-2409',
      'open-mistral-7b',
      'open-mixtral-8x7b',
      'open-mixtral-8x22b'
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

  // OpenAI provider
  const openaiInfo: ICompletionProviderInfo = {
    id: 'openai',
    name: 'OpenAI',
    apiKeyRequirement: 'required',
    defaultModels: [
      'o1',
      'o1-2024-12-17',
      'o3-mini',
      'o3-mini-2025-01-31',
      'o3',
      'o3-2025-04-16',
      'gpt-4.1',
      'gpt-4.1-2025-04-14',
      'gpt-4.1-mini',
      'gpt-4.1-mini-2025-04-14',
      'gpt-4.1-nano',
      'gpt-4.1-nano-2025-04-14',
      'gpt-4o',
      'gpt-4o-2024-05-13',
      'gpt-4o-2024-08-06',
      'gpt-4o-2024-11-20',
      'gpt-4o-mini',
      'gpt-4o-mini-2024-07-18',
      'gpt-4-turbo',
      'gpt-4-turbo-2024-04-09',
      'gpt-4',
      'gpt-4-0613',
      'gpt-4.5-preview',
      'gpt-4.5-preview-2025-02-27',
      'gpt-3.5-turbo-0125',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-1106',
      'chatgpt-4o-latest',
      'gpt-5',
      'gpt-5-2025-08-07',
      'gpt-5-mini',
      'gpt-5-mini-2025-08-07',
      'gpt-5-nano',
      'gpt-5-nano-2025-08-07',
      'gpt-5-chat-latest'
    ],
    supportsBaseURL: true,
    supportsHeaders: true,
    customSettings: {
      completionConfig: {
        useFilterText: true
      }
    },
    factory: (options: IModelOptions) => {
      if (!options.apiKey) {
        throw new Error('API key required for OpenAI');
      }
      const openai = createOpenAI({
        apiKey: options.apiKey,
        ...(options.baseURL && { baseURL: options.baseURL }),
        ...(options.headers && { headers: options.headers })
      });
      const modelName = options.model || 'gpt-4o';
      return openai(modelName);
    }
  };

  registry.registerProvider(openaiInfo);

  // Ollama provider
  const ollamaInfo: ICompletionProviderInfo = {
    id: 'ollama',
    name: 'Ollama',
    apiKeyRequirement: 'none',
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

  // Generic OpenAI-compatible provider
  const genericCompletionInfo: ICompletionProviderInfo = {
    id: 'generic',
    name: 'Generic (OpenAI-compatible)',
    apiKeyRequirement: 'optional',
    defaultModels: [],
    supportsBaseURL: true,
    supportsHeaders: true,
    description: 'Uses /chat/completions endpoint',
    customSettings: {
      completionConfig: {
        temperature: 0.3,
        supportsFillInMiddle: false,
        useFilterText: true
      }
    },
    factory: (options: IModelOptions) => {
      const openai = createOpenAI({
        apiKey: options.apiKey || 'dummy',
        ...(options.baseURL && { baseURL: options.baseURL }),
        ...(options.headers && { headers: options.headers })
      });
      const modelName = options.model || 'gpt-4o';
      return openai(modelName);
    }
  };

  registry.registerProvider(genericCompletionInfo);
}
