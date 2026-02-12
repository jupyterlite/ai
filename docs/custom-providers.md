# Custom Providers

`jupyterlite-ai` supports custom AI providers through its provider registry system. Third-party providers can be registered programmatically in a JupyterLab extension.

Providers are based on the [AI SDK](https://ai-sdk.dev/), which provides a unified interface for working with different AI models.

## Registering a Custom Provider

### Example: Registering a custom OpenAI-compatible provider

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

### Example: Using a custom fetch function

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

## Provider-Specific Tools

When you add a provider that is not built in, you may also want to expose tools
that are specific to that provider.

In AI SDK terms, this can be either:

- **Provider-defined tools** (declared as provider tools in AI SDK), or
- **Provider-executed tools** (tool helpers exposed directly by provider SDKs).

In `jupyterlite-ai`, built-in provider tool wiring currently targets built-in
provider IDs (`openai`, `anthropic`, `google`) and built-in web retrieval
settings. For a custom provider ID, this mapping does **not** apply
automatically.

If you want to support provider-specific tools in your extension:

1. Register your provider with `IProviderRegistry` (as shown above).
2. Define which provider-specific tools you want to expose.
3. Decide how users enable them (for example, `customSettings` UI toggles).
4. Add runtime mapping so those settings become AI SDK tools only when the
   matching provider is active.
5. Document provider-specific constraints (for example, compatibility with
   function tools can vary by provider).

Examples of provider-specific capabilities in AI SDK provider docs include web
search/fetch, file search, URL context retrieval, code execution, and image
generation depending on the provider.

References:

- AI SDK tools overview: <https://ai-sdk.dev/docs/foundations/tools>
- AI SDK provider-defined tool reference: <https://ai-sdk.dev/docs/reference/ai-sdk-core/tool>
- OpenAI provider docs: <https://ai-sdk.dev/providers/ai-sdk-providers/openai>
- Anthropic provider docs: <https://ai-sdk.dev/providers/ai-sdk-providers/anthropic>
- Google provider docs: <https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai>

For end-user web retrieval behavior and setup details, see
[Web Retrieval](./web-retrieval.md).
