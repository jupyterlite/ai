# jupyterlite-ai

[![Github Actions Status](https://github.com/jupyterlite/ai/workflows/Build/badge.svg)](https://github.com/jupyterlite/ai/actions/workflows/build.yml)
[![lite-badge](https://jupyterlite.rtfd.io/en/latest/_static/badge.svg)](https://jupyterlite.github.io/ai/lab/index.html)

AI code completions and chat for JupyterLab, Notebook 7 and JupyterLite ✨

[a screencast showing the Jupyterlite AI extension in JupyterLite](https://github.com/user-attachments/assets/e33d7d84-53ca-4835-a034-b6757476c98b)

## Requirements

- JupyterLab >= 4.4.0 or Notebook >= 7.4.0

## ✨ Try it in your browser ✨

You can try the extension in your browser using JupyterLite:

[![lite-badge](https://jupyterlite.rtfd.io/en/latest/_static/badge.svg)](https://jupyterlite.github.io/ai/lab/index.html)

See the [Usage](#usage) section below for more information on how to provide your API key.

## Install

To install the extension, execute:

```bash
pip install jupyterlite-ai
```

To install requirements (JupyterLab, JupyterLite and Notebook):

```bash
pip install jupyterlite-ai[jupyter]
```

## Usage

> [!NOTE]
> This documentation applies to the upcoming **0.9.0** release.
> For the latest stable version, please refer to the [0.8.x branch](https://github.com/jupyterlite/ai/tree/0.8.x).

AI providers typically require using an API key to access their models.

The process is different for each provider, so you may refer to their documentation to learn how to generate new API keys.

### Using a provider with an API key (e.g. Anthropic, MistralAI, OpenAI)

1. Open the AI settings and
2. Click on "Add a new provider"
3. Enter the details for the provider
4. In the chat, select the new provider

![screenshot showing the dialog to add a new provider](https://github.com/user-attachments/assets/823c71c6-5807-44c8-80b6-2e59379a65d5)

### Using Ollama

[Ollama](https://ollama.com/) allows you to run open-weight LLMs locally on your machine.

#### Setting up Ollama

1. Install Ollama following the instructions at https://ollama.com/download
2. Pull a model, for example:

```bash
ollama pull llama3.2
```

3. Start the Ollama server (it typically runs on `http://localhost:11434`)

#### Configuring `jupyterlite-ai` to use Ollama

1. In JupyterLab, open the AI settings panel and go to the **Providers** section
2. Click on "Add a new provider"
3. Select the **Ollama** provider
4. Configure the following settings:
   - **Model**: The model name you pulled (e.g., `llama3.2`)

### Using a generic OpenAI-compatible provider

The Generic provider allows you to connect to any OpenAI-compatible API endpoint.

1. In JupyterLab, open the AI settings panel and go to the **Providers** section
2. Click on "Add a new provider"
3. Select the **Generic** provider
4. Configure the following settings:
   - **Base URL**: The base URL of your API endpoint
   - **Model**: The model name to use
   - **API Key**: Your API key (if required by the provider)

### Using LiteLLM Proxy

[LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy) is an OpenAI-compatible proxy server that allows you to call 100+ LLMs through a unified interface.

Using LiteLLM Proxy with jupyterlite-ai provides flexibility to switch between different AI providers (OpenAI, Anthropic, Google, Azure, local models, etc.) without changing your JupyterLite configuration. It's particularly useful for enterprise deployments where the proxy can be hosted within private infrastructure to manage external API calls and keep API keys server-side.

#### Setting up LiteLLM Proxy

1. Install LiteLLM:

Follow the instructions at https://docs.litellm.ai/docs/simple_proxy.

2. Create a `litellm_config.yaml` file with your model configuration:

```yaml
model_list:
  - model_name: gpt-5
    litellm_params:
      model: gpt-5
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-sonnet
    litellm_params:
      model: claude-sonnet-4-5-20250929
      api_key: os.environ/ANTHROPIC_API_KEY
```

3. Start the proxy server, for example:

```bash
litellm --config litellm_config.yaml
```

The proxy will start on `http://0.0.0.0:4000` by default.

#### Configuring `jupyterlite-ai` to use LiteLLM Proxy

Configure the [Generic provider (OpenAI-compatible)](#using-a-generic-openai-compatible-provider) with the following settings:

- **Base URL**: `http://0.0.0.0:4000` (or your proxy server URL)
- **Model**: The model name from your `litellm_config.yaml` (e.g., `gpt-5`, `claude-sonnet`)
- **API Key (optional)**: If the LiteLLM Proxy server requires an API key, provide it here.

> [!IMPORTANT]
> The API key must be configured on the LiteLLM Proxy server (in the `litellm_config.yaml` file). Providing an API key via the AI provider settings UI will not have any effect, as the proxy server handles authentication with the upstream AI providers.

> [!NOTE]
> For more information about LiteLLM Proxy configuration, see the [LiteLLM documentation](https://docs.litellm.ai/docs/simple_proxy).

## Custom Providers

`jupyterlite-ai` supports custom AI providers through its provider registry system. Third-party providers can be registered programmatically in a JupyterLab extension.

Providers are based on the [Vercel AI SDK](https://sdk.vercel.ai/docs/introduction), which provides a unified interface for working with different AI models.

### Registering a Custom Provider

**Example: Registering a custom OpenAI-compatible provider**

```typescript
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IProviderRegistry } from '@jupyterlite/ai';
import { createOpenAI } from '@ai-sdk/openai';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'my-extension:custom-provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, registry: IProviderRegistry) => {
    const providerInfo = {
      id: 'my-custom-provider',
      name: 'My Custom Provider',
      apiKeyRequirement: 'required' as const,
      defaultModels: ['my-model'],
      supportsBaseURL: true,
      factory: (options: {
        apiKey: string;
        baseURL?: string;
        model?: string;
      }) => {
        const provider = createOpenAI({
          apiKey: options.apiKey,
          baseURL: options.baseURL || 'https://api.example.com/v1'
        });
        return provider(options.model || 'my-model');
      }
    };

    registry.registerProvider(providerInfo);
  }
};
```

The provider configuration object requires the following properties:

- `id`: Unique identifier for the provider
- `name`: Display name shown in the settings UI
- `apiKeyRequirement`: Whether an API key is `'required'`, `'optional'`, or `'none'`
- `defaultModels`: Array of model names to show in the settings
- `supportsBaseURL`: Whether the provider supports a custom base URL
- `factory`: Function that creates and returns a language model (the registry automatically wraps it for chat usage)

**Example: Using a custom fetch function**

You can provide a custom `fetch` function to the provider, which is useful for adding custom headers, handling authentication, or routing requests through a proxy:

```typescript
factory: (options: { apiKey: string; baseURL?: string; model?: string }) => {
  const provider = createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL || 'https://api.example.com/v1',
    fetch: async (url, init) => {
      // Custom fetch implementation
      const modifiedInit = {
        ...init,
        headers: {
          ...init?.headers,
          'X-Custom-Header': 'custom-value'
        }
      };
      return fetch(url, modifiedInit);
    }
  });
  return provider(options.model || 'my-model');
};
```

## API key management

To avoid storing the API keys in the settings, `jupyterlite-ai` uses [jupyter-secrets-manager](https://github.com/jupyterlab-contrib/jupyter-secrets-manager) by default.

The secrets manager get the API keys from a connector in a secure way.\
The default connector of the secrets manager is _in memory_, which means that **the API keys are reset when reloading the page**.

To prevent the keys from being reset on reload, there are two options:

1. use a connector that fetches the keys on a remote server (using secure rest API, or web socket)

This is the recommended method, as it ensures the security of the keys and makes them accessible only to logged-in users. \
But it requires some frontend and backend deployments:

- a server that can store and send the keys on demand
- a way to get authenticated to the server
- a frontend extension providing the connector, able to connect to the server side

2. disable the use of the secrets manager from the AI settings panel

> [!WARNING]
> The API keys will be stored in plain text using the settings system of Jupyterlab
>
> - using Jupyterlab, the settings are stored in a [directory](https://jupyterlab.readthedocs.io/en/stable/user/directories.html#jupyterlab-user-settings-directory) on the server
> - using Jupyterlite, the settings are stored in the [browser](https://jupyterlite.readthedocs.io/en/latest/howto/configure/storage.html#configure-the-browser-storage)

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlite-ai
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlite_ai directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Running UI tests

The UI tests use Playwright and can be configured with environment variables:

- `PWVIDEO`: Controls video recording during tests (default: `retain-on-failure`)
  - `on`: Record video for all tests
  - `off`: Do not record video
  - `retain-on-failure`: Only keep videos for failed tests
- `PWSLOWMO`: Adds a delay (in milliseconds) between Playwright actions for debugging (default: `0`)

Example usage:

```bash
# Record all test videos
PWVIDEO=on jlpm playwright test

# Slow down test execution by 500ms per action
PWSLOWMO=500 jlpm playwright test

# Combine both options
PWVIDEO=on PWSLOWMO=1000 jlpm playwright test
```

### Development uninstall

```bash
pip uninstall jupyterlite-ai
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `@jupyterlite/ai` within that folder.

### Packaging the extension

See [RELEASE](RELEASE.md)
