/**
 * Fix a build error in langchainjs.
 * See https://github.com/langchain-ai/langchainjs/issues/7332
 */
declare module '@anthropic-ai/sdk/resources/index.mjs' {
  export type Tool = any;
}
