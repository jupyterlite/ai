import { IDict } from '../token';

const chromeAiInstructions = `
<i class="fas fa-exclamation-triangle"></i> Support for ChromeAI is still experimental and only available in Google Chrome.

You can test ChromeAI is enabled in your browser by going to the following URL: https://chromeai.org/

Enable the proper flags in Google Chrome.

- chrome://flags/#prompt-api-for-gemini-nano
  - Select: \`Enabled\`
- chrome://flags/#optimization-guide-on-device-model
  - Select: \`Enabled BypassPrefRequirement\`
- chrome://components
  - Click \`Check for Update\` on Optimization Guide On Device Model to download the model
- [Optional] chrome://flags/#text-safety-classifier

<img src="https://github.com/user-attachments/assets/d48f46cc-52ee-4ce5-9eaf-c763cdbee04c" alt="A screenshot showing how to enable the ChromeAI flag in Google Chrome" width="500px">

Then restart Chrome for these changes to take effect.

<i class="fas fa-exclamation-triangle"></i> On first use, Chrome will download the on-device model, which can be as large as 22GB (according to their docs and at the time of writing).
During the download, ChromeAI may not be available via the extension.

<i class="fa fa-info-circle" aria-hidden="true"></i> For more information about Chrome Built-in AI: https://developer.chrome.com/docs/ai/get-started
`;

const mistralAIInstructions = `
<i class="fas fa-exclamation-triangle"></i> This extension is still very much experimental. It is not an official MistralAI extension.

1. Go to https://console.mistral.ai/api-keys/ and create an API key.

<img src="https://raw.githubusercontent.com/jupyterlite/ai/refs/heads/main/img/1-api-key.png" alt="Screenshot showing how to create an API key" width="500px">

2. Open the JupyterLab settings and go to the **Ai providers** section to select the \`MistralAI\`
   provider and the API key (required).

<img src="https://raw.githubusercontent.com/jupyterlite/ai/refs/heads/main/img/2-jupyterlab-settings.png" alt="Screenshot showing how to add the API key to the settings" width="500px">

3. Open the chat, or use the inline completer

<img src="https://raw.githubusercontent.com/jupyterlite/ai/refs/heads/main/img/3-usage.png" alt="Screenshot showing how to use the chat" width="500px">
`;

export const instructions: IDict = {
  ChromeAI: chromeAiInstructions,
  MistralAI: mistralAIInstructions
};
