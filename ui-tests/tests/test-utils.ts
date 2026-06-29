/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

export const QWEN_MODEL_NAME = 'Qwen2.5';
export const FUNCTIONGEMMA_MODEL_NAME = 'Functiongemma';

export const DEFAULT_GENERIC_PROVIDER_SETTINGS = {
  '@jupyternaut/persona:settings-model': {
    defaultProvider: 'generic-qwen',
    mcpServers: [],
    providers: [
      {
        id: 'generic-qwen',
        name: QWEN_MODEL_NAME,
        provider: 'generic',
        model: 'qwen2.5:0.5b',
        baseURL: 'http://localhost:11434/v1'
      },
      {
        id: 'generic-functiongemma',
        name: FUNCTIONGEMMA_MODEL_NAME,
        provider: 'generic',
        model: 'functiongemma',
        baseURL: 'http://localhost:11434/v1'
      }
    ],
    toolsEnabled: false,
    useSameProviderForChatAndCompleter: true,
    useSecretsManager: false
  },
  '@jupyterlite/ai:chat': {
    showTokenUsage: false
  }
};

export const TEST_PROVIDERS = [
  { name: 'Generic', settings: DEFAULT_GENERIC_PROVIDER_SETTINGS }
];

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

export const openSettings = async (
  page: IJupyterLabPageFixture,
  globalSettings?: boolean
): Promise<Locator> => {
  const args = globalSettings ? {} : { query: 'AI Chat' };
  await page.evaluate(async args => {
    await window.jupyterapp.commands.execute('settingeditor:open', args);
  }, args);

  // Activate the settings tab, sometimes it does not automatically.
  const settingsTab = page
    .getByRole('main')
    .getByRole('tab', { name: 'Settings', exact: true });
  await settingsTab.click();
  await page.waitForCondition(
    async () => (await settingsTab.getAttribute('aria-selected')) === 'true'
  );
  return (await page.activity.getPanelLocator('Settings')) as Locator;
};
