/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import {
  CHAT_PANEL_ID,
  CHAT_PANEL_TITLE,
  TEST_PROVIDERS,
  openChatPanel
} from './test-utils';

const TEST_CHAT_NAME = 'chat-panel-test';
const TEST_CHAT_FILE = `${TEST_CHAT_NAME}.chat`;

const NOT_CONFIGURED_TEXT = 'Please configure your AI settings first';

test.describe('#withoutModel', () => {
  test('should open the chat panel', async ({ page }) => {
    const chatIcon = page.getByTitle(CHAT_PANEL_TITLE);
    await chatIcon.click();
    await expect(page.locator(`[id="${CHAT_PANEL_ID}"]`)).toBeVisible();
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

    test.beforeEach(async ({ page }) => {
      await openChatPanel(page, TEST_CHAT_NAME);
    });

    test.afterEach(async ({ page }) => {
      if (await page.contents.fileExists(TEST_CHAT_FILE)) {
        await page.contents.deleteFile(TEST_CHAT_FILE);
      }
    });

    test('should create a chat', async ({ page }) => {
      const panel = await openChatPanel(page);

      // Check that the chat panel is visible
      await expect(panel).toBeVisible();

      // Check that there's a chat created and opened
      const chatWidgetToolbar = page.locator(
        `[id="${CHAT_PANEL_ID}"] .jp-chat-sidepanel-widget-toolbar`
      );
      await expect(chatWidgetToolbar).toBeVisible();

      // Check that a chat name is shown
      await expect(
        chatWidgetToolbar.locator('.jp-chat-sidepanel-widget-title')
      ).toBeVisible();
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

    test.skip('should suggest /clear when typing /cl', async ({ page }) => {
      const panel = await openChatPanel(page);
      const input = panel
        .locator('.jp-chat-input-container')
        .getByRole('combobox');

      await input.pressSequentially('/cl');

      await expect(page.getByText('/clear', { exact: true })).toBeVisible();
    });

    test.skip('should clear messages with /clear', async ({ page }) => {
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

      await page.evaluate(async () => {
        await window.jupyterapp.commands.execute(
          '@jupyternaut/persona:open-settings'
        );
      });

      const aiSettingsWidget = page.locator('#jupyternaut-persona-settings');
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
      await page.locator('.jp-Dialog input').fill(newName);
      await page.locator('.jp-Dialog .jp-mod-accept').click();
      await expect(
        chatWidgetToolbar.locator('.jp-chat-sidepanel-widget-title')
      ).toContainText(newName, { ignoreCase: true });

      if (await page.contents.fileExists(`${newName}.chat`)) {
        await page.contents.deleteFile(`${newName}.chat`);
      }
    });

    test('should move the chat between areas', async ({ page }) => {
      const panel = await openChatPanel(page);

      // Check that the chat panel is visible
      await expect(panel).toBeVisible();

      // Get the current chat name before moving.
      const chatWidgetToolbar = page.locator(
        `[id="${CHAT_PANEL_ID}"] .jp-chat-sidepanel-widget-toolbar`
      );
      const chatNameLocator = chatWidgetToolbar.locator(
        '.jp-chat-sidepanel-widget-title'
      );
      await expect(chatNameLocator).toBeVisible();
      const chatName = (await chatNameLocator.getAttribute('title')) ?? '';

      // Move the chat to main area.
      await chatWidgetToolbar
        .getByTitle('Move the chat to the main area')
        .click();
      await expect(chatWidgetToolbar).not.toBeAttached();

      const mainAreaTab = page.activity.getTabLocator(chatName);
      await expect(mainAreaTab).toHaveCount(1);
      const mainAreaPanel = await page.activity.getPanelLocator(chatName);
      await mainAreaPanel
        ?.locator('[data-command="jupyterlab-chat:moveChat"]')
        .click();
      await expect(chatWidgetToolbar).toBeVisible();
      await expect(mainAreaTab).toHaveCount(0);
    });

    test.skip('should show a context badge placeholder when enabled', async ({
      page
    }) => {
      const panel = await openChatPanel(page);

      await expect(panel.getByTitle('Session tokens: 0')).toBeVisible();
    });

    test('should prefill and reveal chats through public commands', async ({
      page
    }) => {
      const panel = await openChatPanel(page);
      const chatName = 'Prefilled Chat';
      const sideInputText = 'Draft prompt from command API';
      const mainInputText = 'Prompt moved to main area';
      const updatedMainInputText = 'Updated prompt in the same main chat';

      // Open a chat with a prefilled input in the side panel.
      await page.evaluate(
        ({ name, input }) => {
          void window.jupyterapp.commands.execute(
            'jupyterlab-chat:openWithMessage',
            {
              name,
              input,
              inSidePanel: true
            }
          );
        },
        { name: chatName, input: sideInputText }
      );

      const sideToolbar = page.locator(
        `[id="${CHAT_PANEL_ID}"] .jp-chat-sidepanel-widget-toolbar`
      );
      await expect(
        sideToolbar.locator('.jp-chat-sidepanel-widget-title')
      ).toContainText(chatName, { ignoreCase: true });
      const sideInput = panel
        .locator('.jp-chat-input-container')
        .getByRole('combobox');
      await expect(sideInput).toHaveValue(sideInputText);

      // Open the same chat in the main area with a new prefilled input.
      await page.evaluate(
        ({ name, input }) => {
          void window.jupyterapp.commands.execute(
            'jupyterlab-chat:openWithMessage',
            {
              name,
              input
            }
          );
        },
        { name: chatName, input: mainInputText }
      );

      const mainAreaTab = page.activity.getTabLocator(chatName);
      await expect(mainAreaTab).toHaveCount(1);
      const mainAreaPanel = await page.activity.getPanelLocator(chatName);
      if (!mainAreaPanel) {
        throw new Error('Expected the moved chat to be visible in main area');
      }
      const mainInput = mainAreaPanel
        .locator('.jp-chat-input-container')
        .getByRole('combobox');
      await expect(mainInput).toHaveValue(mainInputText);

      // Re-open in main area with updated input.
      await page.evaluate(
        ({ name, input }) => {
          void window.jupyterapp.commands.execute(
            'jupyterlab-chat:openWithMessage',
            {
              name,
              input
            }
          );
        },
        { name: chatName, input: updatedMainInputText }
      );
      await expect(mainAreaTab).toHaveCount(1);
      await expect(mainInput).toHaveValue(updatedMainInputText);

      if (await page.contents.fileExists(`${chatName}.chat`)) {
        await page.contents.deleteFile(`${chatName}.chat`);
      }
    });
  })
);
