/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

export const DEFAULT_SETTINGS_MODEL_SETTINGS = {
  '@jupyterlite/ai:settings-model': {
    activeProvider: 'ollama-1759407012872',
    mcpServers: [],
    providers: [
      {
        id: 'ollama-1759407012872',
        name: 'Qwen2',
        provider: 'ollama',
        model: 'qwen2:0.5b'
      }
    ],
    showTokenUsage: false,
    toolsEnabled: false,
    useSameProviderForChatAndCompleter: true,
    useSecretsManager: false
  }
};
