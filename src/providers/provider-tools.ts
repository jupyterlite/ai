import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { Tool } from 'ai';

type ToolMap = Record<string, Tool>;

interface IProviderToolContext {
  provider: string;
  customSettings?: unknown;
  hasFunctionTools: boolean;
}

type IUserLocation = {
  type: 'approximate';
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
};

interface IRangeOptions {
  min?: number;
  max?: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asInteger(
  value: unknown,
  range: IRangeOptions = {}
): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return undefined;
  }
  if (range.min !== undefined && value < range.min) {
    return undefined;
  }
  if (range.max !== undefined && value > range.max) {
    return undefined;
  }
  return value;
}

function asUnitInterval(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

function normalizeDomain(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const withoutProtocol = normalized.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol.split('/')[0].trim();
  if (!hostname) {
    return undefined;
  }

  return hostname.startsWith('*.') ? hostname.slice(2) : hostname;
}

function asDomainArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = Array.from(
    new Set(
      value
        .filter((v): v is string => typeof v === 'string')
        .map(normalizeDomain)
        .filter((domain): domain is string => !!domain)
    )
  );

  return values.length > 0 ? values : undefined;
}

function asSearchContextSize(
  value: unknown
): 'low' | 'medium' | 'high' | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return undefined;
}

function asGoogleSearchMode(
  value: unknown
): 'MODE_DYNAMIC' | 'MODE_UNSPECIFIED' | undefined {
  if (value === 'MODE_DYNAMIC' || value === 'MODE_UNSPECIFIED') {
    return value;
  }
  return undefined;
}

function asCountryCode(value: unknown): string | undefined {
  const country = asString(value)?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) {
    return undefined;
  }
  return country;
}

function asUserLocation(value: unknown): IUserLocation | undefined {
  const location = asRecord(value);
  if (!location) {
    return undefined;
  }

  const country = asCountryCode(location.country);
  const city = asString(location.city);
  const region = asString(location.region);
  const timezone = asString(location.timezone);

  if (!country && !city && !region && !timezone) {
    return undefined;
  }

  return {
    type: 'approximate',
    ...(country && { country }),
    ...(city && { city }),
    ...(region && { region }),
    ...(timezone && { timezone })
  };
}

function createOpenAIWebSearchTool(
  webSearchSettings: Record<string, unknown>
): Tool {
  const externalWebAccess = asBoolean(webSearchSettings.externalWebAccess);
  const searchContextSize = asSearchContextSize(
    webSearchSettings.searchContextSize
  );
  const userLocation = asUserLocation(webSearchSettings.userLocation);
  const allowedDomains = asDomainArray(webSearchSettings.allowedDomains);

  return openai.tools.webSearch({
    ...(externalWebAccess !== undefined && { externalWebAccess }),
    ...(searchContextSize && { searchContextSize }),
    ...(userLocation && { userLocation }),
    ...(allowedDomains && {
      filters: {
        allowedDomains
      }
    })
  });
}

function createAnthropicWebSearchTool(
  webSearchSettings: Record<string, unknown>
): Tool {
  const maxUses = asInteger(webSearchSettings.maxUses, { min: 1 });
  const allowedDomains = asDomainArray(webSearchSettings.allowedDomains);
  const blockedDomains = asDomainArray(webSearchSettings.blockedDomains);
  const userLocation = asUserLocation(webSearchSettings.userLocation);

  return anthropic.tools.webSearch_20250305({
    ...(maxUses !== undefined && { maxUses }),
    ...(allowedDomains && { allowedDomains }),
    ...(blockedDomains && { blockedDomains }),
    ...(userLocation && { userLocation })
  });
}

function createAnthropicWebFetchTool(
  webFetchSettings: Record<string, unknown>
): Tool {
  const maxUses = asInteger(webFetchSettings.maxUses, { min: 1 });
  const allowedDomains = asDomainArray(webFetchSettings.allowedDomains);
  const blockedDomains = asDomainArray(webFetchSettings.blockedDomains);
  const maxContentTokens = asInteger(webFetchSettings.maxContentTokens, {
    min: 1
  });
  const citations = asRecord(webFetchSettings.citations);
  const citationsEnabled =
    asBoolean(webFetchSettings.citationsEnabled) ??
    asBoolean(citations?.enabled);

  return anthropic.tools.webFetch_20250910({
    ...(maxUses !== undefined && { maxUses }),
    ...(allowedDomains && { allowedDomains }),
    ...(blockedDomains && { blockedDomains }),
    ...(maxContentTokens !== undefined && { maxContentTokens }),
    ...(citationsEnabled !== undefined && {
      citations: { enabled: citationsEnabled }
    })
  });
}

function createGoogleWebSearchTool(
  webSearchSettings: Record<string, unknown>
): Tool {
  const mode = asGoogleSearchMode(webSearchSettings.mode);
  const dynamicThreshold = asUnitInterval(webSearchSettings.dynamicThreshold);

  return google.tools.googleSearch({
    ...(mode && { mode }),
    ...(dynamicThreshold !== undefined && { dynamicThreshold })
  });
}

export function createProviderTools(options: IProviderToolContext): ToolMap {
  const tools: ToolMap = {};
  const customSettings = asRecord(options.customSettings);

  if (!customSettings) {
    return tools;
  }

  const webSearchSettings = asRecord(customSettings.webSearch);
  const webFetchSettings = asRecord(customSettings.webFetch);
  const webSearchEnabled = asBoolean(webSearchSettings?.enabled) === true;
  const webFetchEnabled = asBoolean(webFetchSettings?.enabled) === true;

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
