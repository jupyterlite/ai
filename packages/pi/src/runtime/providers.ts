import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type {
  Api,
  AuthInteraction,
  AuthPrompt,
  Model,
  OAuthAuth,
  Provider
} from '@earendil-works/pi-ai';
import {
  Dialog,
  InputDialog,
  Notification,
  showDialog
} from '@jupyterlab/apputils';
import { getAppAttribution, requestApiKey } from '@jupyternaut/agent';
import fs from 'fs';
import path from 'path';

import { AGENT_DIR } from './vfs';

const MODELS_FILE = path.join(AGENT_DIR, 'models.json');

/**
 * Provider ids whose API is reachable from a web page (CORS).
 */
const BROWSER_PROVIDERS = new Set([
  'anthropic',
  'deepseek',
  'google',
  'groq',
  'huggingface',
  'mistral',
  'openai',
  'openrouter',
  'together',
  'xai'
]);

/**
 * pi's terminal takes an error with this message as a cancelled login, not
 * as a failure.
 */
class Cancelled extends Error {
  constructor() {
    super('Login cancelled');
  }
}

interface IModelsConfig {
  providers?: Record<string, unknown>;
}

/**
 * Parse models.json as pi does: `//` comments and trailing commas are
 * allowed.
 */
function parseModels(text: string): IModelsConfig {
  const json = text
    .replace(/^\uFEFF/, '')
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, match =>
      match[0] === '"' ? match : ''
    )
    .replace(
      /"(?:\\.|[^"\\])*"|,(\s*[}\]])/g,
      (match, tail?: string) => tail ?? (match[0] === '"' ? match : '')
    );
  const config = JSON.parse(json);
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('the file is not a JSON object');
  }
  return config;
}

/**
 * A literal value in pi's config value syntax, where `$NAME` reads an
 * environment variable and a leading `!` runs a command.
 */
function escapeConfigValue(value: string): string {
  const escaped = value.replace(/\$/g, () => '$$');
  return escaped.startsWith('!') ? `$${escaped}` : escaped;
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
export function adaptProviders(runtime: ModelRuntime): void {
  for (const provider of runtime.getProviders()) {
    if (provider.id === 'openrouter') {
      runtime.registerNativeProvider(openRouterProvider(provider));
      openRouterModels ??= fetchOpenRouterModels();
      openRouterModels.then(
        () => runtime.refresh({ providers: [provider.id] }),
        error => console.warn('pi: cannot list the OpenRouter models', error)
      );
    } else if (provider.auth.oauth) {
      runtime.registerNativeProvider({
        ...provider,
        auth: { ...provider.auth, oauth: undefined }
      });
    }
  }
}

/**
 * Asks the questions of a pi login flow with JupyterLab dialogs.
 */
const dialogInteraction: AuthInteraction = {
  async prompt(prompt: AuthPrompt): Promise<string> {
    if (prompt.type === 'select') {
      const labels = prompt.options.map(option => option.label);
      const choice = await InputDialog.getItem({
        title: prompt.message,
        items: labels
      });
      const id = prompt.options[labels.indexOf(choice.value ?? '')]?.id;
      if (!choice.button.accept || id === undefined) {
        throw new Cancelled();
      }
      return id;
    }
    const options = { title: prompt.message, placeholder: prompt.placeholder };
    const result =
      prompt.type === 'secret'
        ? await InputDialog.getPassword(options)
        : await InputDialog.getText(options);
    const value = (result.value ?? '').trim();
    // An empty key would replace the stored one.
    if (!result.button.accept || (prompt.type === 'secret' && !value)) {
      throw new Cancelled();
    }
    return value;
  },
  notify(event) {
    const message = (event as { message?: string }).message;
    if (message) {
      Notification.info(message, { autoClose: 5000 });
    }
  }
};

/**
 * Store a credential of a model provider in the pi credentials: an API key,
 * or the result of an account sign-in.
 */
async function login(method: 'api_key' | 'oauth'): Promise<void> {
  const runtime = await ModelRuntime.create({
    authPath: path.join(AGENT_DIR, 'auth.json'),
    modelsPath: MODELS_FILE
  });
  adaptProviders(runtime);
  const providers = runtime
    .getProviders()
    .filter(provider =>
      method === 'oauth'
        ? provider.auth.oauth
        : BROWSER_PROVIDERS.has(provider.id) && provider.auth.apiKey?.login
    );
  if (method === 'oauth' && !providers.length) {
    Notification.warning(
      'No account sign-in works on this page: it needs HTTPS or localhost.'
    );
    return;
  }
  const labels = providers.map(
    provider =>
      (method === 'oauth' && provider.auth.oauth?.loginLabel) ||
      (provider.name ?? provider.id)
  );
  const choice = await InputDialog.getItem({
    title: method === 'oauth' ? 'Account' : 'Model provider',
    items: labels
  });
  const provider = providers[labels.indexOf(choice.value ?? '')];
  if (!choice.button.accept || !provider) {
    return;
  }
  const name = provider.name ?? provider.id;
  try {
    await runtime.login(provider.id, method, dialogInteraction);
  } catch (error) {
    if (!(error instanceof Cancelled)) {
      Notification.error(
        `${method === 'oauth' ? 'Cannot sign in to' : 'Cannot save the API key of'} ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return;
  }
  Notification.success(`pi can now use the ${name} models.`, {
    autoClose: 5000
  });
}

/**
 * Store an API key for a model provider in the pi credentials.
 */
export function setApiKey(): Promise<void> {
  return login('api_key');
}

/**
 * Sign in with an account of a model provider (OpenRouter).
 */
export function signIn(): Promise<void> {
  return login('oauth');
}

/**
 * Add an OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, a proxy...) to
 * the pi models.
 */
export async function addEndpoint(): Promise<void> {
  const readModels = (): IModelsConfig | undefined => {
    if (!fs.existsSync(MODELS_FILE)) {
      return {};
    }
    try {
      return parseModels(fs.readFileSync(MODELS_FILE, 'utf-8'));
    } catch (error) {
      Notification.error(
        `Cannot read the pi models (${MODELS_FILE}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  const current = readModels();
  if (!current) {
    return;
  }
  const ask = async (
    title: string,
    text = '',
    password = false
  ): Promise<string | undefined> => {
    const result = password
      ? await InputDialog.getPassword({ title })
      : await InputDialog.getText({ title, text });
    return result.button.accept ? (result.value ?? '').trim() : undefined;
  };
  const name = await ask('Provider name', 'ollama');
  if (!name) {
    return;
  }
  if (/[\s/]/.test(name)) {
    Notification.error('The provider name cannot contain "/" or spaces.');
    return;
  }
  if (current.providers?.[name]) {
    const result = await showDialog({
      title: 'Replace the provider',
      body: `pi already has a provider named "${name}". Replace it?`,
      buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Replace' })]
    });
    if (!result.button.accept) {
      return;
    }
  }
  const baseUrl = await ask('Base URL', 'http://localhost:11434/v1');
  if (!baseUrl) {
    return;
  }
  if (!/^https?:\/\/\S+$/i.test(baseUrl)) {
    Notification.error('The base URL must start with http:// or https://.');
    return;
  }
  const models = (await ask('Model ids (comma separated)'))
    ?.split(',')
    .map(id => id.trim())
    .filter(Boolean);
  if (!models?.length) {
    return;
  }
  const apiKey = await ask('API key (leave empty if none)', '', true);
  // Another tab can change the models while the dialogs are open.
  const config = apiKey === undefined ? undefined : readModels();
  if (!config) {
    return;
  }
  config.providers = {
    ...config.providers,
    [name]: {
      baseUrl,
      api: 'openai-completions',
      apiKey: apiKey ? escapeConfigValue(apiKey) : 'none',
      models: models.map(id => ({ id }))
    }
  };
  fs.writeFileSync(MODELS_FILE, JSON.stringify(config, null, 2));
  Notification.success(`Added the ${name} models to pi.`, { autoClose: 5000 });
}
