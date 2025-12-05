# Custom Providers

`jupyterlite-ai` supports custom AI providers through its provider registry system. Third-party providers can be registered programmatically in a JupyterLab extension.

Providers are based on the [Vercel AI SDK](https://sdk.vercel.ai/docs/introduction), which provides a unified interface for working with different AI models.

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
