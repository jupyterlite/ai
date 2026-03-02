/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import {
  QWEN_MODEL_NAME,
  CHAT_PANEL_ID,
  CHAT_PANEL_TITLE,
  TEST_PROVIDERS,
  openChatPanel
} from './test-utils';

const NOT_CONFIGURED_TEXT = 'Please configure your AI settings first';

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

  test('should not create a chat if there is no provider', async ({ page }) => {
    const content = 'Hello';
    const panel = await openChatPanel(page);
    await panel.getByTitle('Create a new chat').click();

    // Should open an error dialog
    await expect(page.locator('.jp-Dialog')).toBeVisible();

    // Should open the AI settings
    await expect(page.locator('#jupyterlite-ai-settings')).toBeVisible();
  });
});

TEST_PROVIDERS.forEach(({ name, settings }) =>
  test.describe(`#chatWithModel${name}`, () => {
    test.use({
      mockSettings: {
        ...galata.DEFAULT_SETTINGS,
        ...settings,
        '@jupyterlab/apputils-extension:notification': {
          checkForUpdates: false,
          fetchNews: 'false',
          doNotDisturbMode: true
        }
      }
    });

    test('should have a default chat', async ({ page }) => {
      const panel = await openChatPanel(page);

      // Check that the chat panel is visible
      await expect(panel).toBeVisible();

      // Check that there's a default chat created and opened
      const chatWidgetToolbar = page.locator(
        `[id="${CHAT_PANEL_ID}"] .jp-chat-sidepanel-widget-toolbar`
      );
      await expect(chatWidgetToolbar).toBeVisible();

      // Check that the default chat has the name of the default model
      await expect(
        chatWidgetToolbar.locator('.jp-chat-sidepanel-widget-title')
      ).toContainText(QWEN_MODEL_NAME, { ignoreCase: true });
    });

    test('should have a model', async ({ page }) => {
      test.setTimeout(60 * 1000);

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
      await expect(
        panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
      ).toHaveCount(1, { timeout: 60000 });
      await expect(messages).toHaveCount(2);

      await expect(
        messages.last().locator('.jp-chat-message-header')
      ).toHaveText(/Jupyternaut/);
      await expect(
        messages.last().locator('.jp-chat-rendered-message')
      ).not.toHaveText(NOT_CONFIGURED_TEXT);
    });

    test('should suggest /clear when typing /cl', async ({ page }) => {
      const panel = await openChatPanel(page);
      const input = panel
        .locator('.jp-chat-input-container')
        .getByRole('combobox');

      await input.pressSequentially('/cl');

      await expect(page.getByText('/clear', { exact: true })).toBeVisible();
    });

    test('should clear messages with /clear', async ({ page }) => {
      const content = 'Hello';
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
      await expect(
        panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
      ).toHaveCount(1, { timeout: 60000 });

      const writingIndicator = panel.locator('.jp-chat-writers > *');
      await expect(writingIndicator).toHaveCSS('visibility', 'hidden', {
        timeout: 60000
      });

      await expect(messages).toHaveCount(2);

      await input.pressSequentially('/clear');
      await sendButton.click();

      await expect(messages).toHaveCount(0);
    });

    test('should receive an error message when removing the model', async ({
      page
    }) => {
      const content = 'Hello';
      const panel = await openChatPanel(page);

      const settingsButton = panel.getByTitle('Open AI Settings');
      await settingsButton.click();

      const aiSettingsWidget = page.locator('#jupyterlite-ai-settings');
      await expect(aiSettingsWidget).toBeVisible();

      // Remove the existing default provider for this test only
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
        messages.first().locator('.jp-chat-rendered-message')
      ).toHaveText(content);

      await expect(
        messages.last().locator('.jp-chat-rendered-message')
      ).toContainText(NOT_CONFIGURED_TEXT);
    });

    test('should rename the chat', async ({ page }) => {
      const newName = 'My chat';
      const panel = await openChatPanel(page);

      // Check that the chat panel is visible
      await expect(panel).toBeVisible();

      // Rename the chat
      const chatWidgetToolbar = page.locator(
        `[id="${CHAT_PANEL_ID}"] .jp-chat-sidepanel-widget-toolbar`
      );
      await chatWidgetToolbar.getByTitle('Rename chat').click();
      await page.waitForSelector('.jp-Dialog input');
      await page.locator('.jp-Dialog input').pressSequentially(newName);
      await page.locator('.jp-Dialog .jp-mod-accept').click();
      await expect(
        chatWidgetToolbar.locator('.jp-chat-sidepanel-widget-title')
      ).toContainText(newName, { ignoreCase: true });
    });

    test('should move the chat between areas', async ({ page }) => {
      const panel = await openChatPanel(page);

      // Check that the chat panel is visible
      await expect(panel).toBeVisible();

      // Move the chat to main area
      const chatWidgetToolbar = page.locator(
        `[id="${CHAT_PANEL_ID}"] .jp-chat-sidepanel-widget-toolbar`
      );
      await chatWidgetToolbar
        .getByTitle('Move the chat to the main area')
        .click();
      await expect(chatWidgetToolbar).not.toBeAttached();

      const mainAreaTab = page.activity.getTabLocator(QWEN_MODEL_NAME);
      await expect(mainAreaTab).toHaveCount(1);
      const mainAreaPanel =
        await page.activity.getPanelLocator(QWEN_MODEL_NAME);
      await mainAreaPanel
        ?.locator('[data-command="@jupyterlite/ai:move-chat"]')
        .click();
      await expect(chatWidgetToolbar).toBeVisible();
      await expect(mainAreaTab).toHaveCount(0);
    });
  })
);
