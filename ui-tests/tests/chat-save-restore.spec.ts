/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import {
  CHAT_PANEL_ID,
  DEFAULT_GENERIC_PROVIDER_SETTINGS,
  QWEN_MODEL_NAME,
  openChatPanel
} from './test-utils';

const BACKUP_DIR = 'chats-backup';
const BACKUP_FILE = `${BACKUP_DIR}/${QWEN_MODEL_NAME}.json`;
const EXPECT_TIMEOUT = 120000;

test.describe('#chatSaveRestore', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      ...DEFAULT_GENERIC_PROVIDER_SETTINGS,
      '@jupyterlab/apputils-extension:notification': {
        checkForUpdates: false,
        fetchNews: 'false',
        doNotDisturbMode: true
      }
    }
  });

  test.afterEach(async ({ page }) => {
    // Clean up backup files created during tests.
    if (await page.filebrowser.contents.directoryExists(BACKUP_DIR)) {
      await page.filebrowser.contents.deleteDirectory(BACKUP_DIR);
    }
  });

  test('should show the save and auto-save buttons in the toolbar', async ({
    page
  }) => {
    const panel = await openChatPanel(page);
    const saveContainer = panel.locator('.jp-ai-SaveButton');

    await expect(saveContainer).toBeVisible();
    await expect(saveContainer.getByTitle('Save chat')).toBeVisible();
    await expect(saveContainer.getByTitle('Auto-save')).toBeVisible();
  });

  test('should save the chat to a backup file', async ({ page }) => {
    const panel = await openChatPanel(page);

    await panel.locator('.jp-ai-SaveButton').getByTitle('Save chat').click();

    await page.waitForCondition(
      async () => await page.filebrowser.contents.fileExists(BACKUP_FILE)
    );
  });

  test('should toggle auto-save on and off', async ({ page }) => {
    const panel = await openChatPanel(page);
    const saveContainer = panel.locator('.jp-ai-SaveButton');
    const autoSaveButton = saveContainer.getByTitle('Auto-save');

    // Initially not toggled.
    await expect(saveContainer).not.toHaveClass(/lm-mod-toggled/);

    // Toggle on.
    await autoSaveButton.click();
    await expect(saveContainer).toHaveClass(/lm-mod-toggled/);

    // Toggle off.
    await autoSaveButton.click();
    await expect(saveContainer).not.toHaveClass(/lm-mod-toggled/);
  });

  test('should auto-save the chat after a message is sent', async ({
    page
  }) => {
    test.setTimeout(30 * 1000);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );

    // Enable auto-save.
    await panel.locator('.jp-ai-SaveButton').getByTitle('Auto-save').click();
    await expect(panel.locator('.jp-ai-SaveButton')).toHaveClass(
      /lm-mod-toggled/
    );

    // Send a message to trigger the auto-save debouncer.
    await input.pressSequentially('Hello');
    await sendButton.click();
    await expect(panel.locator('.jp-chat-message')).toHaveCount(1);

    // Wait for the debounced auto-save (3 s debounce + buffer).
    await page.waitForTimeout(4000);

    expect(await page.filebrowser.contents.fileExists(BACKUP_FILE)).toBe(true);
  });

  test('should restore messages after page reload', async ({ page }) => {
    test.setTimeout(30 * 1000);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const userMessage = 'Hello';

    // Send a message.
    await input.pressSequentially(userMessage);
    await sendButton.click();

    // Wait for a response from agent.
    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    // Save the chat.
    await panel.locator('.jp-ai-SaveButton').getByTitle('Save chat').click();

    // Wait for the chat to be created.
    await page.waitForCondition(
      async () => await page.filebrowser.contents.fileExists(BACKUP_FILE)
    );

    // Reload the page.
    await page.reload();
    await page.waitForSelector('.jp-LabShell');

    // Re-open the chat panel.
    const reloadedPanel = await openChatPanel(page);

    // The messages should have been restored.
    await expect(reloadedPanel.locator('.jp-chat-message')).toHaveCount(2, {
      timeout: 10000
    });
    await expect(
      reloadedPanel
        .locator('.jp-chat-message')
        .first()
        .locator('.jp-chat-rendered-message')
    ).toContainText(userMessage);
  });

  test('should restore messages from a custom backup directory', async ({
    page
  }) => {
    test.setTimeout(EXPECT_TIMEOUT);

    const customDir = 'custom-chat-backup';
    const backupPath = `${customDir}/${QWEN_MODEL_NAME}.json`;

    // Update settings to use a custom backup directory.
    await page.evaluate(async (dir: string) => {
      const app = (window as any).jupyterapp;
      await app.serviceManager.settings.save(
        '@jupyterlite/ai:settings-model',
        JSON.stringify({ chatBackupDirectory: dir })
      );
    }, customDir);

    const panel = await openChatPanel(page);

    // Update the backup directory in settings
    const settingsButton = panel.getByTitle('Open AI Settings');
    await settingsButton.click();
    const aiSettingsWidget = page.locator('#jupyterlite-ai-settings');
    await expect(aiSettingsWidget).toBeVisible();
    await aiSettingsWidget.getByText('BEHAVIOR').click();

    const backupDirectoryInput = aiSettingsWidget.getByLabel(
      'Chat Backup Directory'
    );
    // Sometime clear method does nothing on MUI input.
    while (await backupDirectoryInput.inputValue()) {
      await backupDirectoryInput.clear();
    }
    await backupDirectoryInput.pressSequentially(customDir, { delay: 100 });

    // Send a message
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const userMessage = 'Hello';

    await input.pressSequentially(userMessage);
    await sendButton.click();

    // Wait for a response from agent.
    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    await panel.locator('.jp-ai-SaveButton').getByTitle('Save chat').click();

    await page.waitForCondition(
      async () => await page.filebrowser.contents.fileExists(backupPath)
    );

    // Backup should be in the custom directory, not the default one.
    expect(await page.filebrowser.contents.fileExists(BACKUP_FILE)).toBe(false);

    // Clean up.
    await page.filebrowser.contents.deleteDirectory(customDir);
  });

  test('should save and restore autosave state and messages', async ({
    page
  }) => {
    test.setTimeout(30 * 1000);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );

    // Enable auto-save and send a message so there is content to save.
    await panel.locator('.jp-ai-SaveButton').getByTitle('Auto-save').click();
    await input.pressSequentially('Hello');
    await sendButton.click();

    // Wait for a response from agent.
    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    // Wait for the debounced auto-save (3 s debounce + buffer).
    await page.waitForTimeout(4000);

    // Wait for the chat to be created.
    expect(await page.filebrowser.contents.fileExists(BACKUP_FILE)).toBe(true);

    // Reload the page.
    await page.reload();
    await page.waitForSelector('.jp-LabShell');

    const reloadedPanel = await openChatPanel(page);

    // The auto-save state should have been restored (container toggled).
    const saveContainer = reloadedPanel.locator('.jp-ai-SaveButton');

    await expect(saveContainer).toHaveClass(/lm-mod-toggled/, {
      timeout: 10000
    });

    // The messages should have been restored.
    await expect(reloadedPanel.locator('.jp-chat-message')).toHaveCount(2, {
      timeout: 10000
    });
  });
});
