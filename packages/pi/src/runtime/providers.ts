import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Api, Model, OAuthAuth, Provider } from '@earendil-works/pi-ai';
import { getAppAttribution, requestApiKey } from '@jupyternaut/agent';

/**
 * pi's terminal takes an error with this message as a cancelled login, not
 * as a failure.
 */
class Cancelled extends Error {
  constructor() {
    super('Login cancelled');
  }
}

/**
 * The OpenRouter sign-in of pi in a popup window, which OpenRouter sends
 * back to the page itself.
 */
const openRouterOAuth: OAuthAuth = {
  name: 'OpenRouter OAuth',
  loginLabel: 'Sign in with OpenRouter',
  async login(interaction) {
    interaction.notify({
      type: 'progress',
      message: 'Sign in to OpenRouter in the new window.'
    });
    const key = await requestApiKey({
      keyLabel: `${getAppAttribution().name} (pi)`,
      signal: interaction.signal
    });
    if (key === null) {
      throw new Cancelled();
    }
    // The credential of pi's own OpenRouter sign-in: a permanent API key.
    return {
      type: 'oauth',
      access: key,
      refresh: '',
      expires: Number.MAX_SAFE_INTEGER
    };
  },
  refresh: async credential => credential,
  toAuth: async credential => ({ apiKey: credential.access })
};

/**
 * The OpenAI-compatible settings of the Claude models of OpenRouter, as in
 * the `~anthropic/*-latest` models of the pi catalog.
 */
const OPENROUTER_CLAUDE_COMPAT = {
  supportsDeveloperRole: false,
  thinkingFormat: 'openrouter',
  supportsStrictMode: true,
  cacheControlFormat: 'anthropic',
  sendSessionAffinityHeaders: true
};

/**
 * A model that works in a web page. OpenRouter does not accept the headers
 * of the Anthropic API from a web page (CORS): its Claude models use the
 * OpenAI-compatible API.
 */
function browserModel<T extends { provider: string; api: string }>(
  model: T
): T {
  if (model.provider !== 'openrouter' || model.api !== 'anthropic-messages') {
    return model;
  }
  return {
    ...model,
    api: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    compat: OPENROUTER_CLAUDE_COMPAT
  };
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * A model of the OpenRouter API (GET /api/v1/models).
 */
interface IOpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  pricing?: Record<string, string | undefined>;
  top_provider?: { max_completion_tokens?: number | null };
  supported_parameters?: string[];
}

/**
 * An OpenRouter model of the API as a pi model, with the OpenAI-compatible
 * API. The prices of OpenRouter are per token, the ones of pi per million.
 */
function openRouterModel(model: IOpenRouterModel): Model<Api> {
  const price = (key: string) => Number(model.pricing?.[key] ?? 0) * 1e6;
  const contextWindow = model.context_length ?? 128000;
  return {
    type: 'chat',
    id: model.id,
    name: model.name ?? model.id,
    api: 'openai-completions',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoning: !!model.supported_parameters?.includes('reasoning'),
    input: model.architecture?.input_modalities?.includes('image')
      ? ['text', 'image']
      : ['text'],
    cost: {
      input: price('prompt'),
      output: price('completion'),
      cacheRead: price('input_cache_read'),
      cacheWrite: price('input_cache_write')
    },
    contextWindow,
    maxTokens: model.top_provider?.max_completion_tokens ?? contextWindow,
    ...(model.id.startsWith('anthropic/') && {
      compat: OPENROUTER_CLAUDE_COMPAT
    })
  } as Model<Api>;
}

/**
 * The models of the OpenRouter API, fetched once for the page: pi runs
 * offline (PI_OFFLINE) and does not refresh the catalogs from the network.
 */
let openRouterModels: Promise<IOpenRouterModel[]> | undefined;
let fetchedOpenRouterModels: IOpenRouterModel[] | undefined;

async function fetchOpenRouterModels(): Promise<IOpenRouterModel[]> {
  const response = await fetch(OPENROUTER_MODELS_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const { data } = (await response.json()) as { data: IOpenRouterModel[] };
  fetchedOpenRouterModels = data;
  return data;
}

/**
 * The OpenRouter provider of pi for a web page: Claude models through the
 * OpenAI-compatible API, and the models of the OpenRouter API that the pi
 * catalog does not have yet (with tool calls), as Jupyternaut lists them.
 * The models store keeps them for the next page loads.
 */
function openRouterProvider(provider: Provider<Api>): Provider<Api> {
  const { getModels, getAllModels } = provider;
  let added: Model<Api>[] = [];
  return {
    ...provider,
    auth: {
      ...provider.auth,
      oauth: window.isSecureContext ? openRouterOAuth : undefined
    },
    getModels: () => [...getModels().map(browserModel), ...added],
    ...(getAllModels && {
      getAllModels: () => [...getAllModels().map(browserModel), ...added]
    }),
    async refreshModels(context) {
      if (fetchedOpenRouterModels) {
        const known = new Set(getModels().map(model => model.id));
        const models = fetchedOpenRouterModels
          .filter(
            model =>
              !known.has(model.id) &&
              model.supported_parameters?.includes('tools')
          )
          .map(openRouterModel);
        await context.publish({
          persist: { models, checkedAt: Date.now() },
          update: () => (added = models)
        });
      } else if (context.stored) {
        const stored = context.stored.models.filter(
          model => model.provider === provider.id
        ) as Model<Api>[];
        await context.publish({ update: () => (added = stored) });
      }
    }
  };
}

/**
 * Adapt the providers to a web page (see `openRouterProvider`). Keep the
 * account sign-ins that work there: only OpenRouter. The providers of the others, also the model API
 * for a ChatGPT sign-in, do not accept requests from a web page (CORS). The
 * OpenRouter sign-in uses WebCrypto, which needs a secure context.
 */
export async function adaptProviders(runtime: ModelRuntime): Promise<void> {
  for (const provider of runtime.getProviders()) {
    if (provider.id === 'openrouter') {
      runtime.registerNativeProvider(openRouterProvider(provider));
      openRouterModels ??= fetchOpenRouterModels();
      openRouterModels.then(
        () => runtime.refresh({ providers: [provider.id] }),
        error => console.warn('pi: cannot list the OpenRouter models', error)
      );
      // A new session looks up its saved model before the refresh of
      // registerNativeProvider ends.
      await runtime.refresh({ providers: [provider.id], allowNetwork: false });
    } else if (provider.auth.oauth) {
      runtime.registerNativeProvider({
        ...provider,
        auth: { ...provider.auth, oauth: undefined }
      });
    }
  }
}
