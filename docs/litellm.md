# Using LiteLLM Proxy

[LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy) is an OpenAI-compatible proxy server that allows you to call 100+ LLMs through a unified interface.

Using LiteLLM Proxy with jupyterlite-ai provides flexibility to switch between different AI providers (OpenAI, Anthropic, Google, Azure, local models, etc.) without changing your JupyterLite configuration. It's particularly useful for enterprise deployments where the proxy can be hosted within private infrastructure to manage external API calls and keep API keys server-side.

## Setting up LiteLLM Proxy

1. Install LiteLLM following the instructions at <https://docs.litellm.ai/docs/simple_proxy>.

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

## Configuring jupyterlite-ai to use LiteLLM Proxy

Configure the [Generic provider (OpenAI-compatible)](./usage.md#using-a-generic-openai-compatible-provider) with the following settings:

- **Base URL**: `http://0.0.0.0:4000` (or your proxy server URL)
- **Model**: The model name from your `litellm_config.yaml` (e.g., `gpt-5`, `claude-sonnet`)
- **API Key (optional)**: If the LiteLLM Proxy server requires an API key, provide it here.

:::{important}
The API key must be configured on the LiteLLM Proxy server (in the `litellm_config.yaml` file). Providing an API key via the AI provider settings UI will not have any effect, as the proxy server handles authentication with the upstream AI providers.
:::

:::{note}
For more information about LiteLLM Proxy configuration, see the [LiteLLM documentation](https://docs.litellm.ai/docs/simple_proxy).
:::
