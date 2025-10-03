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
import { DEFAULT_SETTINGS_MODEL_SETTINGS } from './test-utils';

test.use({
  mockSettings: {
    ...galata.DEFAULT_SETTINGS,
    ...DEFAULT_SETTINGS_MODEL_SETTINGS,
    '@jupyterlab/apputils-extension:notification': {
      checkForUpdates: false,
      fetchNews: 'false',
      doNotDisturbMode: true
    }
  }
});

const CHAT_PANEL_ID = '@jupyterlite/ai:chat-wrapper';

const CHAT_PANEL_TITLE = 'Chat with AI assistant';

const NOT_CONFIGURED_TEXT = 'Please configure your AI settings first';

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

    const settingsButton = panel.getByTitle('Open AI Settings');
    await settingsButton.click();

    const aiSettingsWidget = page.locator('#jupyterlite-ai-settings');
    await expect(aiSettingsWidget).toBeVisible();

    // Remove the existing default provider
    const providerMenu = aiSettingsWidget.getByTestId('MoreVertIcon').first();
    await providerMenu.click();
    const deleteMenuItem = page.getByRole('menuitem', { name: /Delete/i });
    await deleteMenuItem.click();

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
    ).toContainText(NOT_CONFIGURED_TEXT);
  });
});

test.describe('#withModel', () => {
  test('should have a model', async ({ page }) => {
    test.setTimeout(120 * 1000);
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
    ).not.toHaveText(NOT_CONFIGURED_TEXT);
  });
});
