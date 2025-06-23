export default `
<i class="fas fa-exclamation-triangle"></i> This extension is still very much experimental. It is not an official MistralAI extension.

1. Go to <https://console.mistral.ai/api-keys/> and create an API key.

    <img src="https://raw.githubusercontent.com/jupyterlite/ai/refs/heads/main/img/1-api-key.png" alt="Screenshot showing how to create an API key" width="500px">

2. Open the JupyterLab settings and go to the **Ai providers** section to select the \`MistralAI\`
   provider and the API key (required).

    <img src="https://raw.githubusercontent.com/jupyterlite/ai/refs/heads/main/img/2-jupyterlab-settings.png" alt="Screenshot showing how to add the API key to the settings" width="500px">

**Note:** When using MistralAI for completions, only a subset of models are available. Please check [this resource](https://docs.mistral.ai/api/#tag/fim) to see the list of supported models for completions.

3. Open the chat, or use the inline completer

    <img src="https://raw.githubusercontent.com/jupyterlite/ai/refs/heads/main/img/3-usage.png" alt="Screenshot showing how to use the chat" width="500px">
`;
