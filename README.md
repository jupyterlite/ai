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
