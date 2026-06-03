# Using the Otari gateway

[Otari](https://otari.ai/docs/gateway) is an OpenAI-compatible LLM gateway from Mozilla AI (powered by [any-llm](https://github.com/mozilla-ai/any-llm)) that provides API key management, budget enforcement, and usage tracking across multiple LLM providers (OpenAI, Anthropic, Google, etc.). You can run it yourself and point jupyterlite-ai at it as a generic OpenAI-compatible provider.

## Setting up Otari

1. **Installation:** Install and run the gateway following the [Quick Start guide](https://otari.ai/docs/quickstart). The quickest path is Docker Compose, which starts the gateway together with its PostgreSQL database:

```bash
cp config.example.yml config.yml
docker compose up -d
```

See the [deployment guide](https://otari.ai/docs/gateway/deployment) for other options (running from source or using the published Docker image).

2. **Generate a master key** for the management endpoints:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

3. **Configuration:** In `config.yml`, set the `master_key`, configure your providers with their API keys, and define pricing for the models you plan to use:

```yaml
master_key: 'your-secret-master-key'

providers:
  openai:
    api_key: 'sk-...'
  anthropic:
    api_key: 'sk-ant-...'

pricing:
  'openai:gpt-4o':
    input_price_per_million: 2.5
    output_price_per_million: 10.0
```

4. **Verify the gateway is running:**

```bash
curl http://localhost:8000/health
```

The interactive API docs are also served at `http://localhost:8000/docs`.

:::{important}
Otari is **fail-closed on pricing** by default (`require_pricing: true`): a request for a model with no pricing entry is rejected with HTTP 402. Add a pricing entry for each model you use, or set `require_pricing: false` to serve unpriced models without cost tracking. See the [pricing](https://otari.ai/docs/guides/pricing) and [configuration](https://otari.ai/docs/gateway/configuration) guides.
:::

## Configuring jupyterlite-ai to use Otari

Configure the [Generic provider (OpenAI-compatible)](./usage.md#using-a-generic-openai-compatible-provider) with the following settings:

- **Base URL**: `http://localhost:8000/v1` (or your gateway server URL)
- **Model**: the model name with its provider prefix (e.g., `openai:gpt-4o`, `anthropic:claude-sonnet-4-5-20250929`)
- **API Key**: an Otari API key (see below)

:::{tip}
**Getting an API key**: Otari can bootstrap a first-use API key on startup (printed in the gateway logs) when none exists. To create a named, dedicated key, use your master key to mint a virtual API key:

```bash
curl -X POST http://localhost:8000/v1/keys \
  -H "Authorization: Bearer ${OTARI_MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"key_name": "jupyterlite-ai"}'
```

The response contains a key starting with `gw-`. Use it as your API key in jupyterlite-ai. Spend is automatically attributed to that key's own user, so usage and budgets are tracked without the generic OpenAI provider needing to send a `user` field.
:::

:::{note}
Otari uses the `provider:model` format for model names (e.g., `openai:gpt-4o`). Available models come from your configured pricing entries — list them with `GET /v1/models` or check your `config.yml`.
:::

:::{note}
For more about Otari — including budgets, virtual API keys, and deployment — see the [Otari documentation](https://otari.ai/docs).
:::
