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
  }
};

export const TEST_PROVIDERS = [
  { name: 'Generic', settings: DEFAULT_GENERIC_PROVIDER_SETTINGS }
];

export const CHAT_PANEL_ID = 'JupyterlabChat:sidepanel';

export const CHAT_PANEL_TITLE = 'Jupyter Chat';

export async function openChatPanel(
  page: IJupyterLabPageFixture,
  chatName?: string
): Promise<Locator> {
  const panel = page.locator(`[id="${CHAT_PANEL_ID}"]`);
  if (!(await panel.isVisible())) {
    const chatIcon = page.getByTitle(CHAT_PANEL_TITLE).filter();
    await chatIcon.click();
    await page.waitForCondition(() => panel.isVisible());
  }
  // Create a new chat if the panel is showing the placeholder (no chat open).
  const chatInput = panel.locator('.jp-chat-input-container');
  if (!(await chatInput.isVisible())) {
    if (chatName) {
      await page.evaluate(async (name: string) => {
        void window.jupyterapp.commands.execute(
          'jupyterlab-chat:openWithMessage',
          { name, inSidePanel: true }
        );
      }, chatName);
    } else {
      await panel.getByTitle('Create a new chat').first().click();
    }
    await page.waitForCondition(() => chatInput.isVisible());
  }
  // Wait for the persona selector to appear, ensuring `to_persona` metadata is
  // stamped on the input model before the test sends its first message.
  const personaBtn = chatInput.locator('.jp-jai-personaControls-persona-btn');
  await personaBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  return panel;
}

export const openSettings = async (
  page: IJupyterLabPageFixture
): Promise<Locator> => {
  await page.evaluate(async () => {
    await window.jupyterapp.commands.execute(
      '@jupyternaut/persona:open-settings'
    );
  });

  const settingsWidget = page.locator('#jupyternaut-persona-settings');
  await page.waitForCondition(() => settingsWidget.isVisible());
  return settingsWidget;
};
