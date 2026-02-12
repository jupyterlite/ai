import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { Tool } from 'ai';

type ToolMap = Record<string, Tool>;

type IUserLocation = {
  type: 'approximate';
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
};

type IUserLocationInput = Omit<IUserLocation, 'type'>;

interface IWebSearchSettings {
  enabled?: boolean;
  externalWebAccess?: boolean;
  searchContextSize?: 'low' | 'medium' | 'high';
  userLocation?: IUserLocationInput;
  allowedDomains?: string[];
  blockedDomains?: string[];
  maxUses?: number;
  mode?: 'MODE_DYNAMIC' | 'MODE_UNSPECIFIED';
  dynamicThreshold?: number;
}

interface IWebFetchSettings {
  enabled?: boolean;
  maxUses?: number;
  maxContentTokens?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  citationsEnabled?: boolean;
  citations?: {
    enabled?: boolean;
  };
}

/**
 * Provider-level custom settings that control built-in web tools.
 */
export interface IProviderCustomSettings {
  webSearch?: IWebSearchSettings;
  webFetch?: IWebFetchSettings;
}

interface IProviderToolContext {
  provider: string;
  customSettings?: IProviderCustomSettings;
  hasFunctionTools: boolean;
}

const DEFAULT_ANTHROPIC_WEB_FETCH_MAX_USES = 2;
const DEFAULT_ANTHROPIC_WEB_FETCH_MAX_CONTENT_TOKENS = 12000;

function cleanString(value?: string): string {
  return (value || '').trim();
}

function normalizeDomain(value: string): string {
  const normalized = cleanString(value).toLowerCase();
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

function parseUserLocation(
  value?: IUserLocationInput
): IUserLocation | undefined {
  if (!value) {
    return undefined;
  }

  const countryValue = cleanString(value.country).toUpperCase();
  const country =
    countryValue && /^[A-Z]{2}$/.test(countryValue) ? countryValue : undefined;
  const city = cleanString(value.city) || undefined;
  const region = cleanString(value.region) || undefined;
  const timezone = cleanString(value.timezone) || undefined;

  if (!country && !city && !region && !timezone) {
    return undefined;
  }

  return {
    country,
    city,
    region,
    timezone,
    type: 'approximate'
  };
}

function createOpenAIWebSearchTool(
  webSearchSettings: IWebSearchSettings
): Tool {
  const allowedDomains = collectDomains(webSearchSettings.allowedDomains);
  return openai.tools.webSearch({
    externalWebAccess: webSearchSettings.externalWebAccess,
    searchContextSize: webSearchSettings.searchContextSize,
    userLocation: parseUserLocation(webSearchSettings.userLocation),
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
    blockedDomains: blockedDomains.length > 0 ? blockedDomains : undefined,
    userLocation: parseUserLocation(webSearchSettings.userLocation)
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
  const citationsEnabled =
    webFetchSettings.citationsEnabled ?? webFetchSettings.citations?.enabled;
  return anthropic.tools.webFetch_20250910({
    maxUses,
    maxContentTokens,
    allowedDomains: allowedDomains.length > 0 ? allowedDomains : undefined,
    blockedDomains: blockedDomains.length > 0 ? blockedDomains : undefined,
    citations:
      citationsEnabled !== undefined ? { enabled: citationsEnabled } : undefined
  });
}

function createGoogleWebSearchTool(
  webSearchSettings: IWebSearchSettings
): Tool {
  return google.tools.googleSearch({
    mode: webSearchSettings.mode,
    dynamicThreshold: webSearchSettings.dynamicThreshold
  });
}

/**
 * Create provider-defined tools from custom settings and provider capabilities.
 */
export function createProviderTools(options: IProviderToolContext): ToolMap {
  const tools: ToolMap = {};
  if (!options.customSettings) {
    return tools;
  }

  const webSearchSettings = options.customSettings.webSearch;
  const webFetchSettings = options.customSettings.webFetch;

  const webSearchEnabled = webSearchSettings?.enabled === true;
  const webFetchEnabled = webFetchSettings?.enabled === true;

  switch (options.provider) {
    case 'openai': {
      if (webSearchEnabled && webSearchSettings) {
        tools.web_search = createOpenAIWebSearchTool(webSearchSettings);
      }
      break;
    }

    case 'anthropic': {
      if (webSearchEnabled && webSearchSettings) {
        tools.web_search = createAnthropicWebSearchTool(webSearchSettings);
      }
      if (webFetchEnabled && webFetchSettings) {
        tools.web_fetch = createAnthropicWebFetchTool(webFetchSettings);
      }
      break;
    }

    case 'google': {
      if (webSearchEnabled && webSearchSettings && !options.hasFunctionTools) {
        // Google provider-defined tools currently conflict with function tools
        // in some AI SDK + Gemini combinations (custom tools can be ignored).
        // Keep this guard until upstream behavior is resolved:
        // https://github.com/vercel/ai/issues/8258
        tools.google_search = createGoogleWebSearchTool(webSearchSettings);
      }
      break;
    }

    default:
      break;
  }

  return tools;
}
