import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import type { IProviderInfo } from '../tokens';
import type { IModelOptions } from './models';

/**
 * Anthropic provider
 */
export const anthropicProvider: IProviderInfo = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  apiKeyRequirement: 'required',
  defaultModels: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-opus-4-5',
    'claude-opus-4-5-20251101',
    'claude-sonnet-4-5',
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-1',
    'claude-opus-4-1-20250805',
    'claude-opus-4-0',
    'claude-opus-4-20250514',
    'claude-sonnet-4-0',
    'claude-sonnet-4-20250514',
    'claude-3-haiku-20240307'
  ],
  supportsBaseURL: true,
  supportsHeaders: true,
  providerToolCapabilities: {
    webSearch: { implementation: 'anthropic' },
    webFetch: { implementation: 'anthropic' }
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

/**
 * Google Generative AI provider
 */
export const googleProvider: IProviderInfo = {
  id: 'google',
  name: 'Google Generative AI',
  apiKeyRequirement: 'required',
  defaultModels: [
    'gemini-3.1-pro-preview',
    'gemini-3.1-pro-preview-customtools',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-preview',
    'gemini-3-pro-image-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash-lite-preview-09-2025',
    'gemini-2.5-computer-use-preview-10-2025',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-lite-001',
    'gemini-pro-latest',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'deep-research-pro-preview-12-2025',
    'gemma-3-27b-it',
    'gemma-3-12b-it',
    'gemma-3-4b-it',
    'gemma-3-1b-it',
    'gemma-3n-e4b-it',
    'gemma-3n-e2b-it'
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
    return google(modelName);
  }
};

/**
 * Mistral provider
 */
export const mistralProvider: IProviderInfo = {
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
    'codestral-latest',
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
    return mistral(modelName);
  }
};

/**
 * OpenAI provider
 */
export const openaiProvider: IProviderInfo = {
  id: 'openai',
  name: 'OpenAI',
  apiKeyRequirement: 'required',
  defaultModels: [
    'gpt-5.2',
    'gpt-5.2-2025-12-11',
    'gpt-5.2-chat-latest',
    'gpt-5.2-pro',
    'gpt-5.2-pro-2025-12-11',
    'gpt-5.2-codex',
    'gpt-5.1',
    'gpt-5.1-2025-11-13',
    'gpt-5.1-chat-latest',
    'gpt-5',
    'gpt-5-2025-08-07',
    'gpt-5-chat-latest',
    'gpt-5-mini',
    'gpt-5-mini-2025-08-07',
    'gpt-5-nano',
    'gpt-5-nano-2025-08-07',
    'o4-mini',
    'o4-mini-2025-04-16',
    'o3',
    'o3-2025-04-16',
    'o3-mini',
    'o3-mini-2025-01-31',
    'o1',
    'o1-2024-12-17',
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
    'gpt-4o-audio-preview',
    'gpt-4o-audio-preview-2024-12-17',
    'gpt-4o-audio-preview-2025-06-03',
    'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18',
    'gpt-4o-mini-audio-preview',
    'gpt-4o-mini-audio-preview-2024-12-17',
    'gpt-4o-search-preview',
    'gpt-4o-search-preview-2025-03-11',
    'gpt-4o-mini-search-preview',
    'gpt-4o-mini-search-preview-2025-03-11',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0125',
    'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-16k'
  ],
  supportsBaseURL: true,
  supportsHeaders: true,
  providerToolCapabilities: {
    webSearch: { implementation: 'openai' }
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

/**
 * Generic OpenAI-compatible provider
 */
export const genericProvider: IProviderInfo = {
  id: 'generic',
  name: 'Generic (OpenAI-compatible)',
  apiKeyRequirement: 'optional',
  defaultModels: [],
  supportsBaseURL: true,
  supportsHeaders: true,
  supportsToolCalling: true,
  description: 'Uses /chat/completions endpoint',
  baseUrls: [
    {
      url: 'http://localhost:4000',
      description: 'Default for local LiteLLM server'
    },
    {
      url: 'http://localhost:11434/v1',
      description: 'Default for local Ollama server'
    }
  ],
  factory: (options: IModelOptions) => {
    const openaiCompatible = createOpenAICompatible({
      name: options.provider,
      apiKey: options.apiKey || 'dummy',
      baseURL: options.baseURL ?? '',
      ...(options.headers && { headers: options.headers })
    });
    const modelName = options.model || 'gpt-4o';
    return openaiCompatible(modelName);
  }
};
