/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  expect,
  galata,
  IJupyterLabPageFixture,
  test
} from '@jupyterlab/galata';
import { Locator } from '@playwright/test';
import { defaultSettings, setUpOllama } from './test-utils';

test.use({
  mockSettings: {
    ...galata.DEFAULT_SETTINGS,
    ...defaultSettings,
    '@jupyterlab/apputils-extension:notification': {
      checkForUpdates: false,
      fetchNews: 'false',
      doNotDisturbMode: true
    }
  }
});

const CHAT_PANEL_ID = '@jupyterlite/ai:chat-wrapper';

const CHAT_PANEL_TITLE = 'Chat with AI assistant';

async function openChatPanel(page: IJupyterLabPageFixture): Promise<Locator> {
  const panel = page.locator(`[id="${CHAT_PANEL_ID}"]`);
  if (!(await panel.isVisible())) {
    const chatIcon = page.getByTitle(CHAT_PANEL_TITLE).filter();
    await chatIcon.click();
    await page.waitForCondition(() => panel.isVisible());
  }
  return panel;
}

test.describe('#withoutModel', () => {
  test('should contain the chat panel icon', async ({ page }) => {
    const chatIcon = page.getByTitle(CHAT_PANEL_TITLE);
    expect(chatIcon).toHaveCount(1);
    expect(await chatIcon.screenshot()).toMatchSnapshot('chat_icon.png');
  });

  test('should open the chat panel', async ({ page }) => {
    const chatIcon = page.getByTitle('Chat with AI assistant');
    await chatIcon.click();
    await expect(page.locator(`[id="${CHAT_PANEL_ID}"]`)).toBeVisible();
  });

  test('should receive an error message', async ({ page }) => {
    const content = 'Hello';
    const panel = await openChatPanel(page);

    // Click "Open AI Settings" button in the chat panel toolbar
    const settingsButton = panel.getByTitle('Open AI Settings');
    await settingsButton.click();

    // Wait for the AI Settings widget to open
    const aiSettingsWidget = page.locator('#jupyterlite-ai-settings');
    await expect(aiSettingsWidget).toBeVisible();

    // Find and click the menu button for the first provider
    const providerMenu = aiSettingsWidget.locator('button[aria-label="more"]').first();
    await providerMenu.click();

    // Click the "Delete" option in the menu
    const deleteMenuItem = page.getByRole('menuitem', { name: /Delete/i });
    await deleteMenuItem.click();

    // Close the AI Settings widget
    const closeButton = page.locator('.jp-icon-hover[data-icon="ui-components:close"]').last();
    await closeButton.click();

    // Now send a message in the chat
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const messages = panel.locator('.jp-chat-message');

    await input.pressSequentially(content);
    await sendButton.click();
    await expect(messages).toHaveCount(2);

    await expect(
      messages.first().locator('.jp-chat-rendered-markdown')
    ).toHaveText(content);

    await expect(
      messages.last().locator('.jp-chat-rendered-markdown')
    ).toContainText('Please configure your AI settings first');
  });
});

test.describe('#withModel', () => {
  // Set up Ollama with default model.
  test.beforeEach(async ({ page }) => {
    await setUpOllama(page);
  });

  test('should have a model', async ({ page }) => {
    const content = 'Which model are you built from ?';
    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const messages = panel.locator('.jp-chat-message');

    await input.pressSequentially(content);
    await sendButton.click();
    await expect(messages).toHaveCount(2);

    await expect(messages.last().locator('.jp-chat-message-header')).toHaveText(
      /Jupyternaut/
    );
    await expect(
      messages.last().locator('.jp-chat-rendered-markdown')
    ).not.toHaveText('AI provider not configured');
  });
});
