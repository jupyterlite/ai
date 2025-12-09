# Using any-llm-gateway

[any-llm-gateway](https://mozilla-ai.github.io/any-llm/gateway/overview/) is an OpenAI-compatible proxy server that provides production-grade cost controls, budget management, and usage tracking across multiple LLM providers (OpenAI, Anthropic, Google, etc.).

## Setting up any-llm-gateway

1. **Installation:** Install and configure the gateway following the [Quick Start guide](https://mozilla-ai.github.io/any-llm/gateway/quickstart/). This involves creating a directory, downloading the `docker-compose.yml`, and setting up your `config.yml`.

2. Generate a master key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

3. **Configuration:** Configure your providers in `config.yml` with your API keys and model pricing.

4. Start the gateway: Navigate you your gateway directory and run: 

```bash
docker compose up -d
```

5. Verify the gateway is running:

```bash
curl http://localhost:8000/health
# Expected: {"status": "healthy"}
```

## Configuring jupyterlite-ai to use any-llm-gateway

Configure the [Generic provider (OpenAI-compatible)](./usage.md#using-a-generic-openai-compatible-provider) with the following settings:

- **Base URL**: `http://localhost:8000/v1` (or your gateway server URL)
- **Model**: The model name with provider prefix (e.g., `openai:gpt-4`, `anthropic:claude-sonnet-4-5-20250929`)
- **API Key**: Your gateway virtual API key

:::{tip}
**Using virtual API keys**: The master key requires a `user` field in each request, which the generic OpenAI provider doesn't send by default. To use the gateway seamlessly with jupyterlite-ai, create a virtual API key:

```bash
curl -X POST http://localhost:8000/v1/keys \
  -H "Authorization: Bearer ${GATEWAY_MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"key_name": "jupyterlite-ai"}'
```

The response will contain a key starting with `gw-`. Use this virtual key as your API key in jupyterlite-ai. Virtual keys automatically track usage without requiring the `user` field.
:::

:::{note}
any-llm-gateway uses the `provider:model` format for model names (e.g., `openai:gpt-4`). Check your gateway configuration for available models.
:::

:::{note}
For more information about any-llm-gateway configuration, including budget management and virtual API keys, see the [any-llm-gateway documentation](https://mozilla-ai.github.io/any-llm/gateway/overview/).
:::
