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
  await expect(cell!.locator('.jp-GhostText')).toBeVisible();
  await expect(cell!.locator('.jp-GhostText')).not.toBeEmpty();

  expect(requestBody).toHaveProperty('messages');
  expect(requestBody.messages).toHaveLength(2);
  expect(requestBody.messages[1].content).toContain(content);
});
