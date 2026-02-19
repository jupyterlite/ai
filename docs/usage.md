# Usage

AI providers typically require using an API key to access their models.

The process is different for each provider, so you may refer to their documentation to learn how to generate new API keys.

## Using a provider with an API key

For providers like Anthropic, MistralAI, or OpenAI:

1. Open the AI settings
2. Click on "Add a new provider"
3. Enter the details for the provider
4. In the chat, select the new provider

![screenshot showing the dialog to add a new provider](https://github.com/user-attachments/assets/823c71c6-5807-44c8-80b6-2e59379a65d5)

## Using a generic OpenAI-compatible provider

The Generic provider allows you to connect to any OpenAI-compatible API endpoint, including local servers like Ollama and LiteLLM.

1. In JupyterLab, open the AI settings panel and go to the **Providers** section
2. Click on "Add a new provider"
3. Select the **Generic (OpenAI-compatible)** provider
4. Configure the following settings:
   - **Base URL**: The base URL of your API endpoint (suggestions are provided for common local servers)
   - **Model**: The model name to use
   - **API Key**: Your API key (if required by the provider)

See the dedicated pages for specific providers:

- [Using Ollama](./ollama.md)
- [Using LiteLLM Proxy](./litellm.md)
- [Using any-llm-gateway](./any-llm-gateway.md)
- [Web Retrieval tools](./web-retrieval.md)
