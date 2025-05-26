export default `
WebLLM enables running LLMs directly in your browser, making it possible to use AI features without sending data to external servers.

<i class="fas fa-info-circle"></i> WebLLM runs models entirely in your browser, so initial model download may be large (100MB-2GB depending on the model).

<i class="fas fa-exclamation-triangle"></i> <strong>Requirements:</strong> WebLLM requires a browser with WebGPU support (Chrome 113+, Edge 113+, or Safari 17+). It will not work on older browsers or browsers without WebGPU enabled.

1. Enter a model in the JupyterLab settings under the **Ai providers** section. Select the \`WebLLM\` provider and type the model you want to use.
2. When you first use WebLLM, your browser will download the model. A progress notification will appear:
3. Once loaded, use the chat
4. Example of available models:
  - Llama-3.2-1B-Instruct-q4f32_1-MLC
  - Mistral-7B-Instruct-v0.3-q4f32_1-MLC
  - Qwen3-0.6B-q4f32_1-MLC
5. See the full list of models: https://github.com/mlc-ai/web-llm/blob/632d34725629b480b5b2772379ef5c150b1286f0/src/config.ts#L303-L309

<i class="fas fa-exclamation-triangle"></i> Model performance depends on your device's hardware capabilities. More powerful devices will run models faster. Some larger models may not work well on devices with limited GPU memory or may experience slow response times.
`;

/**
 * Check if the browser supports WebLLM.
 */
export async function compatibilityCheck(): Promise<string | null> {
  // Check if the browser supports the ChromeAI model
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return 'Your browser does not support WebLLM, it does not support required WebGPU.';
  }
  if ((await navigator.gpu.requestAdapter()) === null) {
    return 'You may need to enable WebGPU, `await navigator.gpu.requestAdapter()` is null.';
  }
  // If the model is available, return null to indicate compatibility
  return null;
}
