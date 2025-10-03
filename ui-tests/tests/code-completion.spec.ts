/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
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

test('should suggest inline completion', async ({ page }) => {
  test.setTimeout(60 * 1000);

  const content = 'def test';
  let requestBody: any = null;
  await page.notebook.createNew();
  await page.notebook.enterCellEditingMode(0);
  const cell = await page.notebook.getCellInputLocator(0);

  page.on('request', data => {
    if (
      data.method() === 'POST' &&
      ['127.0.0.1', 'localhost'].includes(new URL(data.url()).hostname) &&
      new URL(data.url()).pathname === '/api/chat'
    ) {
      requestBody = JSON.parse(data.postData() ?? '{}');
    }
  });
  await cell?.pressSequentially(content);

  // Ghost text should be visible as suggestion.
  // Retry by typing more content if ghost text doesn't appear
  const ghostText = cell!.locator('.jp-GhostText');
  const maxRetries = 3;
  let retries = 0;
  let ghostTextVisible = false;

  while (retries < maxRetries && !ghostTextVisible) {
    try {
      await expect(ghostText).toBeVisible({ timeout: 10000 });
      ghostTextVisible = true;
    } catch {
      retries++;
      if (retries < maxRetries) {
        // Trigger completion again by typing and deleting a character
        if (retries > 1) {
          await cell?.press('Backspace');
        }
        await cell?.pressSequentially('_');
      }
    }
  }

  // Final assertion that should pass after retries
  await expect(ghostText).toBeVisible({ timeout: 10000 });
  await expect(ghostText).not.toBeEmpty();

  expect(requestBody).toHaveProperty('messages');
  expect(requestBody.messages).toHaveLength(2);
  expect(requestBody.messages[1].content).toContain(content);
});
