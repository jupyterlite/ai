/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import { DEFAULT_GENERIC_PROVIDER_SETTINGS, openChatPanel } from './test-utils';

const EXPECT_TIMEOUT = 120000;
const FIXTURE_URL = 'http://localhost:8765/health';

test.use({
  mockSettings: {
    ...galata.DEFAULT_SETTINGS,
    '@jupyterlab/apputils-extension:notification': {
      checkForUpdates: false,
      fetchNews: 'false',
      doNotDisturbMode: true
    },
    '@jupyterlite/ai:settings-model': {
      ...DEFAULT_GENERIC_PROVIDER_SETTINGS['@jupyterlite/ai:settings-model'],
      toolsEnabled: true,
      defaultProvider: 'generic-functiongemma',
      // Keep the test deterministic with small local models.
      systemPrompt:
        'When the user asks to fetch a URL, call browser_fetch exactly once with the exact URL from the user and do not call any other tool.'
    }
  }
});

test.describe('#browserFetchTool', () => {
  test('should fetch local CORS-enabled URL with browser_fetch', async ({
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

    const prompt = `Use browser_fetch to fetch this exact URL: ${FIXTURE_URL}`;

    await input.pressSequentially(prompt);
    await sendButton.click();

    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    const browserFetchCall = panel
      .locator('.jp-ai-tool-call')
      .filter({ hasText: 'browser_fetch' })
      .first();

    await expect(browserFetchCall).toBeVisible({ timeout: EXPECT_TIMEOUT });
    await expect(browserFetchCall).toContainText(FIXTURE_URL, {
      timeout: EXPECT_TIMEOUT
    });

    await browserFetchCall.click();

    await expect(browserFetchCall).toContainText('"success": true', {
      timeout: EXPECT_TIMEOUT
    });
    await expect(browserFetchCall).toContainText('"status": 200', {
      timeout: EXPECT_TIMEOUT
    });
    await expect(browserFetchCall).toContainText('mcp-server', {
      timeout: EXPECT_TIMEOUT
    });
  });
});
