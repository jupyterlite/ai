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
import { Locator, Request } from '@playwright/test';
import { openSettings, setUpOllama } from './test-utils';

test.use({
  mockSettings: {
    ...galata.DEFAULT_SETTINGS,
    '@jupyterlab/apputils-extension:notification': {
      checkForUpdates: false,
      fetchNews: 'false',
      doNotDisturbMode: true
    }
  }
});

// Set up Ollama with default model.
test.beforeEach(async ({ page }) => {
  // Set a debouncer delay to inline completer, to avoid sending too much completion
  // requests while typing.
  const settingsPanel = await openSettings(page, 'Inline Completer');
  const debouncerInput = settingsPanel.locator(
    'input[name="jp-SettingsEditor-@jupyterlab/completer-extension:inline-completer_providers_@jupyterlite/ai_debouncerDelay"]'
  );
  await debouncerInput.fill('200');

  // wait for the settings to be saved
  await expect(page.activity.getTabLocator('Settings')).toHaveAttribute(
    'class',
    /jp-mod-dirty/
  );
  await expect(page.activity.getTabLocator('Settings')).not.toHaveAttribute(
    'class',
    /jp-mod-dirty/
  );

  await setUpOllama(page);
});

test('should suggest inline completion', async ({ page }) => {
  const content = 'def test';
  const requestBody: any[] = [];
  await page.notebook.createNew();
  await page.notebook.enterCellEditingMode(0);
  const cell = await page.notebook.getCellInputLocator(0);

  page.on('request', data => {
    if (data.url() === 'http://127.0.0.1:11434/api/chat') {
      requestBody.push(JSON.parse(data.postData() ?? '{}'));
    }
  });
  await cell?.pressSequentially(content);

  // Ghost text should be visible as suggestion.
  await expect(cell!.locator('.jp-GhostText')).toBeVisible();
  await expect(cell!.locator('.jp-GhostText')).not.toBeEmpty();

  expect(requestBody).toHaveLength(1);
  const body = requestBody[requestBody.length - 1];
  expect(body).toHaveProperty('messages');
  expect(body.messages).toHaveLength(2);
  expect(body.messages[1].content).toBe(content);
});
