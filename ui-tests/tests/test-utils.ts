/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

export const DEFAULT_MODEL_NAME = 'Qwen2.5';

export const DEFAULT_SETTINGS_MODEL_SETTINGS = {
  '@jupyterlite/ai:settings-model': {
    defaultProvider: 'ollama-1759407012872',
    mcpServers: [],
    providers: [
      {
        id: 'ollama-1759407012872',
        name: DEFAULT_MODEL_NAME,
        provider: 'ollama',
        model: 'qwen2.5:0.5b'
      }
    ],
    showTokenUsage: false,
    toolsEnabled: false,
    useSameProviderForChatAndCompleter: true,
    useSecretsManager: false
  }
};

export const CHAT_PANEL_ID = '@jupyterlite/ai:chat-panel';

export const CHAT_PANEL_TITLE = 'Chat with AI assistant';

export async function openChatPanel(
  page: IJupyterLabPageFixture
): Promise<Locator> {
  const panel = page.locator(`[id="${CHAT_PANEL_ID}"]`);
  if (!(await panel.isVisible())) {
    const chatIcon = page.getByTitle(CHAT_PANEL_TITLE).filter();
    await chatIcon.click();
    await page.waitForCondition(() => panel.isVisible());
  }
  return panel;
}
