import { getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';
import {
  CredentialSynchronizationError,
  ModelRuntime
} from '@earendil-works/pi-coding-agent';
import { Dialog, Notification } from '@jupyterlab/apputils';
import {
  nullTranslator,
  type ITranslator,
  type TranslationBundle
} from '@jupyterlab/translation';
import { getAppAttribution, requestApiKey } from '@jupyternaut/agent';
import type { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';
import fs from 'fs';
import path from 'path';
import { stripJsonComments } from 'pi-coding-agent-package/dist/utils/json.js';

import { AGENT_DIR } from './vfs';

const MODELS_FILE = path.join(AGENT_DIR, 'models.json');
/**
 * The keys of the endpoints go to auth.json, which stays in the browser, as
 * the other keys: models.json is in the drive.
 */
const AUTH_FILE = path.join(AGENT_DIR, 'auth.json');

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
 * The value of the provider option for a new OpenAI-compatible endpoint, and
 * the prefix of the options for the endpoints of models.json.
 */
const ENDPOINT = 'endpoint:';

/**
 * A model provider of the form.
 */
interface IProviderOption {
  id: string;
  name: string;
  keyName: string;
  configured: boolean;
}

interface IModelsConfig {
  providers?: Record<string, unknown>;
}

/**
 * An endpoint of models.json, as this dialog writes it.
 */
interface IEndpointConfig {
  baseUrl?: unknown;
  apiKey?: unknown;
  models?: unknown;
}

/**
 * The value of the form: a key for a provider, an endpoint, or the removal
 * of one of them.
 */
type Setup =
  | { kind: 'key'; providerId: string; key: string }
  | {
      kind: 'endpoint';
      name: string;
      baseUrl: string;
      models: string[];
      apiKey: string;
    }
  | { kind: 'logout'; providerId: string }
  | { kind: 'remove'; name: string };

/**
 * A literal value in pi's config value syntax, where `$NAME` reads an
 * environment variable and a leading `!` runs a command.
 */
function escapeConfigValue(value: string): string {
  const escaped = value.replace(/\$/g, () => '$$');
  return escaped.startsWith('!') ? `$${escaped}` : escaped;
}

/**
 * The value of `escapeConfigValue`.
 */
function unescapeConfigValue(value: string): string {
  return value.replace(/^\$!/, '!').replace(/\$\$/g, () => '$');
}

/**
 * One labelled control of the form.
 */
function field<T extends HTMLElement>(
  parent: HTMLElement,
  text: string | HTMLElement,
  control: T
): T {
  const label = document.createElement('label');
  label.append(text, control);
  parent.append(label);
  return control;
}

function input(attributes: Partial<HTMLInputElement>): HTMLInputElement {
  return Object.assign(document.createElement('input'), {
    autocomplete: 'off',
    spellcheck: false,
    ...attributes
  });
}

function note(parent: HTMLElement): HTMLElement {
  const element = document.createElement('div');
  element.className = 'jp-pi-ProviderForm-note';
  parent.append(element);
  return element;
}

function button(
  parent: HTMLElement,
  text: string,
  title: string
): HTMLButtonElement {
  const element = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'jp-pi-ProviderForm-button',
    textContent: text,
    title
  });
  parent.append(element);
  return element;
}

/**
 * The form of the dialog. The fields of the provider that is not selected are
 * disabled: the dialog does not check them.
 */
class ProviderForm extends Widget implements Dialog.IBodyWidget<Setup> {
  constructor(options: ProviderForm.IOptions) {
    super();
    this.addClass('jp-pi-ProviderForm');
    this._options = options;
    const { providers, endpoints, trans } = options;

    this._provider = field(
      this.node,
      trans.__('Provider'),
      document.createElement('select')
    );
    for (const provider of providers) {
      const label = provider.configured
        ? trans.__('%1 (configured)', provider.name)
        : provider.name;
      this._provider.add(new Option(label, provider.id));
    }
    for (const name of endpoints.keys()) {
      this._provider.add(
        new Option(trans.__('%1 (endpoint)', name), `${ENDPOINT}${name}`)
      );
    }
    this._provider.add(
      new Option(trans.__('OpenAI-compatible endpoint'), ENDPOINT)
    );
    this._provider.value = providers.some(({ id }) => id === 'openrouter')
      ? 'openrouter'
      : (providers[0]?.id ?? ENDPOINT);
    this._provider.addEventListener('change', () => {
      this._signInAbort?.abort();
      this._update();
    });

    this._keyGroup = this.node.appendChild(document.createElement('fieldset'));
    this._keyLabel = document.createElement('span');
    this._key = field(
      this._keyGroup,
      this._keyLabel,
      input({ type: 'password', required: true, pattern: '\\s*\\S+\\s*' })
    );
    this._signIn = button(
      this._keyGroup,
      trans.__('Sign In with OpenRouter'),
      trans.__('Create a key with your OpenRouter account')
    );
    this._signIn.addEventListener('click', () => this._signInWithOpenRouter());
    this._status = note(this._keyGroup);

    this._endpointGroup = this.node.appendChild(
      document.createElement('fieldset')
    );
    this._name = field(
      this._endpointGroup,
      trans.__('Name'),
      input({ required: true, pattern: '[^\\s\\/]+' })
    );
    this._nameNote = note(this._endpointGroup);
    this._baseUrl = field(
      this._endpointGroup,
      trans.__('Base URL'),
      input({ type: 'url', required: true, pattern: 'https?://\\S+' })
    );
    this._models = field(
      this._endpointGroup,
      trans.__('Model ids, separated by commas'),
      input({
        required: true,
        pattern: '.*[^,\\s].*',
        placeholder: trans.__('llama3.2, qwen3:8b')
      })
    );
    this._endpointKey = field(
      this._endpointGroup,
      trans.__('API key'),
      input({ type: 'password', placeholder: trans.__('Optional') })
    );

    this._remove = button(
      this.node,
      trans.__('Remove'),
      trans.__('Remove the saved key or endpoint from pi')
    );
    this._remove.addEventListener('click', () => {
      this._removing = true;
      // The dialog does not check the disabled fields.
      this._keyGroup.disabled = this._endpointGroup.disabled = true;
      this.submit?.();
    });
    this._update();
  }

  /**
   * Called by the dialog when it closes the form with the default button.
   */
  submit?: () => void;

  getValue(): Setup {
    const value = this._provider.value;
    if (this._removing) {
      return value.startsWith(ENDPOINT)
        ? { kind: 'remove', name: value.slice(ENDPOINT.length) }
        : { kind: 'logout', providerId: value };
    }
    if (!value.startsWith(ENDPOINT)) {
      return { kind: 'key', providerId: value, key: this._key.value.trim() };
    }
    return {
      kind: 'endpoint',
      name: this._name.value.trim(),
      baseUrl: this._baseUrl.value.trim(),
      models: this._models.value
        .split(',')
        .map(id => id.trim())
        .filter(Boolean),
      apiKey: this._endpointKey.value.trim()
    };
  }

  /**
   * Update the constraints that the input attributes cannot express: a new
   * endpoint cannot take the name of a built-in provider.
   */
  validate(): void {
    const { builtIns, endpoints, trans } = this._options;
    const name = this._name.value.trim();
    const error = builtIns.has(name)
      ? trans.__('%1 is a built-in provider: choose another name.', name)
      : '';
    this._name.setCustomValidity(error);
    this._nameNote.textContent =
      error ||
      (endpoints.has(name)
        ? trans.__('Saving changes the %1 endpoint.', name)
        : '');
  }

  dispose(): void {
    this._signInAbort?.abort();
    super.dispose();
  }

  /**
   * Show the fields of the selected provider: its key, the endpoint of
   * models.json, or the defaults of a new endpoint.
   */
  private _update(): void {
    const { providers, endpoints, trans } = this._options;
    const { value } = this._provider;
    const provider = providers.find(({ id }) => id === value);
    this._keyGroup.hidden = this._keyGroup.disabled = !provider;
    this._endpointGroup.hidden = this._endpointGroup.disabled = !!provider;
    this._remove.hidden = provider ? !provider.configured : value === ENDPOINT;
    this._status.textContent = '';
    if (provider) {
      this._keyLabel.textContent = provider.keyName;
      this._key.placeholder = provider.configured
        ? trans.__('Paste a key to replace the saved one')
        : trans.__('Paste the key');
      this._signIn.hidden =
        provider.id !== 'openrouter' || !window.isSecureContext;
      return;
    }
    const name = value.slice(ENDPOINT.length);
    const endpoint = endpoints.get(name);
    const text = (item: unknown) => (typeof item === 'string' ? item : '');
    const key = text(endpoint?.apiKey);
    this._name.value = name || 'ollama';
    this._baseUrl.value = endpoint
      ? text(endpoint.baseUrl)
      : 'http://localhost:11434/v1';
    this._models.value = Array.isArray(endpoint?.models)
      ? endpoint.models
          .map(model => text(model?.id))
          .filter(Boolean)
          .join(', ')
      : '';
    this._endpointKey.value = key === 'none' ? '' : unescapeConfigValue(key);
  }

  /**
   * Create an OpenRouter key in a popup window, then save it. The popup must
   * open in the click event.
   */
  private async _signInWithOpenRouter(): Promise<void> {
    const { trans } = this._options;
    this._signInAbort = new AbortController();
    // A change of the provider aborts the sign-in.
    const { signal } = this._signInAbort;
    this._signIn.disabled = true;
    this._status.textContent = trans.__(
      'Sign in to OpenRouter in the new window.'
    );
    try {
      const key = await requestApiKey({
        keyLabel: `${getAppAttribution().name} (pi)`,
        signal
      });
      if (this.isDisposed || signal.aborted) {
        return;
      }
      if (key === null) {
        this._status.textContent = trans.__('The sign-in was cancelled.');
        return;
      }
      this._key.value = key;
      this.submit?.();
    } catch (error) {
      this._status.textContent = trans.__(
        'Cannot sign in to OpenRouter: %1',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this._signIn.disabled = false;
    }
  }

  private _options: ProviderForm.IOptions;
  private _provider: HTMLSelectElement;
  private _keyGroup: HTMLFieldSetElement;
  private _keyLabel: HTMLSpanElement;
  private _key: HTMLInputElement;
  private _signIn: HTMLButtonElement;
  private _signInAbort?: AbortController;
  private _status: HTMLElement;
  private _endpointGroup: HTMLFieldSetElement;
  private _name: HTMLInputElement;
  private _nameNote: HTMLElement;
  private _baseUrl: HTMLInputElement;
  private _models: HTMLInputElement;
  private _endpointKey: HTMLInputElement;
  private _remove: HTMLButtonElement;
  private _removing = false;
}

namespace ProviderForm {
  export interface IOptions {
    trans: TranslationBundle;
    /**
     * The providers that take an API key in a web page.
     */
    providers: IProviderOption[];
    /**
     * The ids of the built-in providers.
     */
    builtIns: Set<string>;
    /**
     * The endpoints of models.json by name.
     */
    endpoints: Map<string, IEndpointConfig>;
  }
}

/**
 * A dialog that checks its form when it opens and after a change of the
 * provider, not only after an input.
 */
class ProviderDialog extends Dialog<Setup> {
  constructor(form: ProviderForm, options: Partial<Dialog.IOptions<Setup>>) {
    super({ ...options, body: form });
    this._form = form;
    form.submit = () => {
      this._checkValidation();
      this.resolve();
    };
    // The dialog checks the form on the input event, before the change
    // event of the provider select switches the fields.
    form.node.addEventListener('change', () => this._checkValidation());
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._checkValidation();
  }

  /**
   * Let Enter activate a focused button of the form (Sign In, Remove): the
   * dialog prevents it.
   */
  protected _evtKeydown(event: KeyboardEvent): void {
    if (
      event.key === 'Enter' &&
      event.target instanceof HTMLButtonElement &&
      this._form.node.contains(event.target)
    ) {
      return;
    }
    super._evtKeydown(event);
  }

  protected _checkValidation(): void {
    this._form.validate();
    super._checkValidation();
  }

  private _form: ProviderForm;
}

/**
 * Read models.json or auth.json as pi does: `//` comments and trailing commas
 * are allowed.
 */
function readConfig(
  file: string,
  trans: TranslationBundle
): Record<string, unknown> | undefined {
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    const text = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '');
    const config = JSON.parse(stripJsonComments(text));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('the file is not a JSON object');
    }
    return config;
  } catch (error) {
    Notification.error(
      trans.__(
        'Cannot read %1: %2',
        file,
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

/**
 * The API key of auth.json for a provider.
 */
function storedKey(
  auth: Record<string, unknown>,
  providerId: string
): string | undefined {
  const credential = auth[providerId] as
    | { type?: unknown; key?: unknown }
    | undefined;
  return credential?.type === 'api_key' && typeof credential.key === 'string'
    ? credential.key
    : undefined;
}

/**
 * Add a model provider to pi in one dialog: an API key, the OpenRouter
 * sign-in, or an OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, a
 * proxy...). The dialog also changes or removes a saved key or endpoint.
 * Resolves with true when the providers of pi change.
 */
export async function addProvider(translator?: ITranslator): Promise<boolean> {
  const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
  const config: IModelsConfig | undefined = readConfig(MODELS_FILE, trans);
  const auth = readConfig(AUTH_FILE, trans);
  if (!config || !auth) {
    return false;
  }
  const runtime = await ModelRuntime.create();
  const endpoints = new Map(
    (Object.entries(config.providers ?? {}) as [string, IEndpointConfig][]).map(
      ([name, endpoint]) => [
        name,
        { ...endpoint, apiKey: storedKey(auth, name) ?? endpoint.apiKey }
      ]
    )
  );
  const builtIns = new Set(
    runtime
      .getProviders()
      .map(({ id }) => id)
      .filter(id => !endpoints.has(id))
  );
  const providers = runtime
    .getProviders()
    .filter(
      provider =>
        BROWSER_PROVIDERS.has(provider.id) && provider.auth.apiKey?.login
    )
    .map(provider => ({
      id: provider.id,
      name: provider.name ?? provider.id,
      keyName: provider.auth.apiKey?.name ?? trans.__('API key'),
      configured: runtime.getProviderAuthStatus(provider.id).configured
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const form = new ProviderForm({ trans, providers, builtIns, endpoints });
  const result = await new ProviderDialog(form, {
    title: trans.__('Add a Model Provider'),
    buttons: [
      Dialog.cancelButton(),
      Dialog.okButton({ label: trans.__('Save') })
    ],
    focusNodeSelector: 'input[type="password"]'
  }).launch();
  const setup = result.button.accept ? result.value : null;
  if (!setup || (setup.kind === 'key' && !setup.key)) {
    return false;
  }

  if (setup.kind === 'key' || setup.kind === 'logout') {
    const login = setup.kind === 'key';
    const name =
      providers.find(({ id }) => id === setup.providerId)?.name ??
      setup.providerId;
    try {
      if (login) {
        await runtime.login(setup.providerId, 'api_key', {
          prompt: async prompt => {
            if (prompt.type !== 'secret') {
              throw new Error(`unexpected question: ${prompt.message}`);
            }
            return setup.key;
          },
          notify: () => undefined
        });
      } else {
        await runtime.logout(setup.providerId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof CredentialSynchronizationError)) {
        Notification.error(
          login
            ? trans.__('Cannot save the %1 key: %2', name, message)
            : trans.__('Cannot remove the %1 key: %2', name, message)
        );
        return false;
      }
      Notification.warning(
        login
          ? trans.__('pi saved the %1 key, but: %2', name, message)
          : trans.__('pi removed the %1 key, but: %2', name, message)
      );
      return true;
    }
    Notification.success(
      login
        ? trans.__('pi can now use the %1 models.', name)
        : trans.__('pi removed the %1 key.', name),
      { autoClose: 5000 }
    );
    return true;
  }

  // Another tab can change the models while the dialog is open.
  const current: IModelsConfig | undefined = readConfig(MODELS_FILE, trans);
  const currentAuth = readConfig(AUTH_FILE, trans);
  if (!current || !currentAuth) {
    return false;
  }
  // models.json can change a built-in provider: its key or sign-in stays.
  const builtIn = (getBuiltinProviders() as string[]).includes(setup.name);
  if (setup.kind === 'remove') {
    delete current.providers?.[setup.name];
    if (!builtIn) {
      delete currentAuth[setup.name];
    }
  } else {
    // Keep the settings that the form does not show (headers, model data).
    const previous = { ...(current.providers?.[setup.name] as object) } as {
      apiKey?: unknown;
      models?: { id: string }[];
    };
    delete previous.apiKey;
    const models = new Map(previous.models?.map(model => [model.id, model]));
    current.providers = {
      ...current.providers,
      [setup.name]: {
        api: 'openai-completions',
        ...previous,
        baseUrl: setup.baseUrl,
        // pi uses the models of an endpoint that has a key.
        ...(setup.apiKey ? {} : { apiKey: 'none' }),
        models: setup.models.map(id => models.get(id) ?? { id })
      }
    };
    if (setup.apiKey) {
      currentAuth[setup.name] = {
        type: 'api_key',
        key: escapeConfigValue(setup.apiKey)
      };
    } else if (!builtIn) {
      delete currentAuth[setup.name];
    }
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(currentAuth, null, 2));
  fs.writeFileSync(MODELS_FILE, JSON.stringify(current, null, 2));
  Notification.success(
    setup.kind === 'remove'
      ? trans.__('Removed the %1 endpoint from pi.', setup.name)
      : trans.__('Added the %1 models to pi.', setup.name),
    { autoClose: 5000 }
  );
  return true;
}
