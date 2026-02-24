import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { Tool } from 'ai';

import type {
  IProviderInfo,
  IProviderWebFetchImplementation,
  IProviderWebSearchImplementation
} from '../tokens';

type ToolMap = Record<string, Tool>;

interface IWebSearchSettings {
  enabled?: boolean;
  externalWebAccess?: boolean;
  searchContextSize?: 'low' | 'medium' | 'high';
  allowedDomains?: string[];
  blockedDomains?: string[];
  maxUses?: number;
}

interface IWebFetchSettings {
  enabled?: boolean;
  maxUses?: number;
  maxContentTokens?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  citationsEnabled?: boolean;
}

/**
 * Provider-level custom settings that control built-in web tools.
 */
export interface IProviderCustomSettings {
  webSearch?: IWebSearchSettings;
  webFetch?: IWebFetchSettings;
}

interface IProviderToolContext {
  providerInfo?: IProviderInfo | null;
  customSettings?: IProviderCustomSettings;
  hasFunctionTools: boolean;
}

const DEFAULT_ANTHROPIC_WEB_FETCH_MAX_USES = 2;
const DEFAULT_ANTHROPIC_WEB_FETCH_MAX_CONTENT_TOKENS = 12000;

function normalizeDomain(value: string): string {
  const normalized = (value || '').trim().toLowerCase();
  const withoutProtocol = normalized.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol.split('/')[0].trim();
  // Treat "*.example.com" as "example.com" for provider domain filters.
  return hostname.startsWith('*.') ? hostname.slice(2) : hostname;
}

function collectDomains(value?: string[]): string[] {
  value = value || [];
  const values = Array.from(
    new Set(value.map(normalizeDomain).filter(domain => domain.length > 0))
  );

  return values;
}

function createOpenAIWebSearchTool(
  webSearchSettings: IWebSearchSettings
): Tool {
  const allowedDomains = collectDomains(webSearchSettings.allowedDomains);
  return openai.tools.webSearch({
    externalWebAccess: webSearchSettings.externalWebAccess,
    searchContextSize: webSearchSettings.searchContextSize,
    filters: allowedDomains.length > 0 ? { allowedDomains } : undefined
  });
}

function createAnthropicWebSearchTool(
  webSearchSettings: IWebSearchSettings
): Tool {
  const allowedDomains = collectDomains(webSearchSettings.allowedDomains);
  const blockedDomains = collectDomains(webSearchSettings.blockedDomains);
  return anthropic.tools.webSearch_20250305({
    maxUses: webSearchSettings.maxUses,
    allowedDomains: allowedDomains.length > 0 ? allowedDomains : undefined,
    blockedDomains: blockedDomains.length > 0 ? blockedDomains : undefined
  });
}

function createAnthropicWebFetchTool(
  webFetchSettings: IWebFetchSettings
): Tool {
  const maxUses =
    webFetchSettings.maxUses ?? DEFAULT_ANTHROPIC_WEB_FETCH_MAX_USES;
  const maxContentTokens =
    webFetchSettings.maxContentTokens ??
    DEFAULT_ANTHROPIC_WEB_FETCH_MAX_CONTENT_TOKENS;
  const allowedDomains = collectDomains(webFetchSettings.allowedDomains);
  const blockedDomains = collectDomains(webFetchSettings.blockedDomains);
  const citationsEnabled = webFetchSettings.citationsEnabled;
  return anthropic.tools.webFetch_20250910({
    maxUses,
    maxContentTokens,
    allowedDomains: allowedDomains.length > 0 ? allowedDomains : undefined,
    blockedDomains: blockedDomains.length > 0 ? blockedDomains : undefined,
    citations:
      citationsEnabled !== undefined ? { enabled: citationsEnabled } : undefined
  });
}

function createWebSearchTool(
  implementation: IProviderWebSearchImplementation,
  webSearchSettings: IWebSearchSettings
): Tool {
  switch (implementation) {
    case 'openai':
      return createOpenAIWebSearchTool(webSearchSettings);
    case 'anthropic':
      return createAnthropicWebSearchTool(webSearchSettings);
    default:
      throw new Error(
        `Unsupported web search implementation: ${implementation}`
      );
  }
}

function createWebFetchTool(
  implementation: IProviderWebFetchImplementation,
  webFetchSettings: IWebFetchSettings
): Tool {
  switch (implementation) {
    case 'anthropic':
      return createAnthropicWebFetchTool(webFetchSettings);
    default:
      throw new Error(
        `Unsupported web fetch implementation: ${implementation}`
      );
  }
}

/**
 * Create provider-defined tools from custom settings and provider capabilities.
 */
export function createProviderTools(options: IProviderToolContext): ToolMap {
  const tools: ToolMap = {};
  if (
    !options.customSettings ||
    !options.providerInfo?.providerToolCapabilities
  ) {
    return tools;
  }

  const capabilities = options.providerInfo.providerToolCapabilities;
  const webSearchSettings = options.customSettings.webSearch;
  const webFetchSettings = options.customSettings.webFetch;

  const webSearchEnabled = webSearchSettings?.enabled === true;
  const webFetchEnabled = webFetchSettings?.enabled === true;

  const webSearchCapability = capabilities.webSearch;
  if (webSearchEnabled && webSearchSettings && webSearchCapability) {
    const requiresNoFunctionTools =
      webSearchCapability.requiresNoFunctionTools === true;
    if (!requiresNoFunctionTools || !options.hasFunctionTools) {
      tools.web_search = createWebSearchTool(
        webSearchCapability.implementation,
        webSearchSettings
      );
    }
  }

  const webFetchCapability = capabilities.webFetch;
  if (webFetchEnabled && webFetchSettings && webFetchCapability) {
    tools.web_fetch = createWebFetchTool(
      webFetchCapability.implementation,
      webFetchSettings
    );
  }

  return tools;
}
