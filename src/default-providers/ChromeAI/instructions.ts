export default `
<i class="fas fa-exclamation-triangle"></i> Support for ChromeAI is still experimental and only available in Google Chrome.

You can test ChromeAI is enabled in your browser by going to the following URL: <https://chromeai.org/>

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

<i class="fa fa-info-circle" aria-hidden="true"></i> For more information about Chrome Built-in AI: <https://developer.chrome.com/docs/ai/get-started>
`;

/**
 * Check if the browser supports ChromeAI and the model is available.
 */
export async function compatibilityCheck(): Promise<string | null> {
  // Check if the browser supports the ChromeAI model
  if (
    typeof window === 'undefined' ||
    !('LanguageModel' in window) ||
    window.LanguageModel === undefined ||
    (window.LanguageModel as any).availability === undefined
  ) {
    return 'Your browser does not support ChromeAI. Please use an updated chrome based browser like Google Chrome, and follow the instructions in settings to enable it.';
  }
  const languageModel = window.LanguageModel as any;
  if (!(await languageModel.availability())) {
    return 'The ChromeAI model is not available in your browser. Please ensure you have enabled the necessary flags in Google Chrome as described in the instructions in settings.';
  }
  // If the model is available, return null to indicate compatibility
  return null;
}
