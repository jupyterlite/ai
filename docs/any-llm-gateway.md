# Using the Otari gateway

[Otari](https://otari.ai/docs) is an OpenAI-compatible LLM gateway from Mozilla AI (powered by [any-llm](https://github.com/mozilla-ai/any-llm)) that provides API key management, budget enforcement, and usage tracking across multiple LLM providers (OpenAI, Anthropic, Google, etc.). You can run it yourself and point jupyterlite-ai at it as a generic OpenAI-compatible provider.

## Setting up Otari

Install and run the gateway by following the [Otari Quick Start guide](https://otari.ai/docs/quickstart). Once it is running, take note of:

- the gateway URL (e.g. `http://localhost:8000`)
- an Otari API key (see the [Otari documentation](https://otari.ai/docs) for creating one)

## Configuring jupyterlite-ai to use Otari

Configure the [Generic provider (OpenAI-compatible)](./usage.md#using-a-generic-openai-compatible-provider) with the following settings:

- **Base URL**: `http://localhost:8000/v1` (or your gateway server URL)
- **Model**: the model name with its provider prefix, e.g. `openai:gpt-4o` or `anthropic:claude-sonnet-4-5-20250929`
- **API Key**: your Otari API key

:::{note}
For more about Otari — including configuration, budgets, API keys, and deployment — see the [Otari documentation](https://otari.ai/docs).
:::
