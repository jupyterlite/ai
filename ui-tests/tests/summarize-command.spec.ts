/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import { DEFAULT_GENERIC_PROVIDER_SETTINGS, openChatPanel } from './test-utils';

const CHAT_PLUGIN_ID = '@jupyterlite/ai:chat';

async function getAgentHistory(page: any): Promise<unknown[]> {
  return page.evaluate((pluginId: string) => {
    const tracker = (window as any).jupyterapp.pluginRegistry._plugins.get(
      pluginId
    ).service;
    return (
      tracker.currentWidget?.model._persona?.agentManager.getHistory() ?? []
    );
  }, CHAT_PLUGIN_ID);
}

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

test.describe('#summarizeCommand', () => {
  test('should suggest /summarize when typing /sum', async ({ page }) => {
    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');

    await input.pressSequentially('/sum');

    await expect(page.getByText('/summarize', { exact: true })).toBeVisible();
  });

  test('should summarize the conversation with /summarize', async ({
    page
  }) => {
    test.setTimeout(120 * 1000);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const messages = panel.locator('.jp-chat-message');

    // Send a message and wait for the AI reply.
    await input.pressSequentially('Hello, this is a test conversation.');
    await sendButton.click();
    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: 60000 });

    // Wait for the writing indicator to disappear (response complete).
    await expect(panel.locator('.jp-chat-writers > *')).toHaveCSS(
      'visibility',
      'hidden',
      { timeout: 60000 }
    );

    const historyBeforeSummarize = await getAgentHistory(page);
    expect(historyBeforeSummarize.length).toBeGreaterThanOrEqual(2);

    // Run the /summarize command.
    await input.pressSequentially('/summarize');
    await sendButton.click();

    // A new message containing the summary header should appear.
    await expect(
      panel.locator(
        '.jp-chat-rendered-message:has-text("Conversation summary")'
      )
    ).toBeVisible({ timeout: 60000 });

    // After summarizing, the agent history should be collapsed to a single
    // assistant message containing the summary.
    const historyAfterSummarize = await getAgentHistory(page);
    expect(historyAfterSummarize).toHaveLength(1);
    expect((historyAfterSummarize[0] as any).role).toBe('assistant');

    const countBeforeSummarize = historyBeforeSummarize.length;
    expect(messages).toHaveCount(countBeforeSummarize + 1);
  });

  test('should clear input after /summarize is submitted', async ({ page }) => {
    test.setTimeout(120 * 1000);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );

    // Send a message and wait for the AI reply so there is history to summarize.
    await input.pressSequentially('Hello');
    await sendButton.click();
    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: 60000 });
    await expect(panel.locator('.jp-chat-writers > *')).toHaveCSS(
      'visibility',
      'hidden',
      { timeout: 60000 }
    );

    await input.pressSequentially('/summarize');
    await sendButton.click();

    // Wait for the summary to appear, then check the input is cleared.
    await expect(
      panel.locator(
        '.jp-chat-rendered-message:has-text("Conversation summary")'
      )
    ).toBeVisible({ timeout: 60000 });

    await expect(input).toHaveValue('');
  });
});
