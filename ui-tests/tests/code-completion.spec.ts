/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import {
  DEFAULT_GENERIC_PROVIDER_SETTINGS,
  TEST_PROVIDERS
} from './test-utils';

const TIMEOUT = 120000;

TEST_PROVIDERS.forEach(({ name, settings }) =>
  test.describe(`#completionWithModel${name}`, () => {
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

    test('should suggest inline completion', async ({ page }) => {
      // Total timeout should accommodate: maxRetries * RETRY_TIMEOUT + final assertion
      const RETRY_TIMEOUT = 60000; // 60 seconds per retry attempt
      const maxRetries = 3;
      test.setTimeout((maxRetries + 1) * RETRY_TIMEOUT + 30000); // Extra buffer

      const content = 'def test';
      let requestBody: any = null;
      await page.notebook.createNew();
      await page.notebook.enterCellEditingMode(0);
      const cell = await page.notebook.getCellInputLocator(0);

      page.on('request', data => {
        if (data.method() === 'POST') {
          const url = new URL(data.url());
          if (
            ['127.0.0.1', 'localhost'].includes(url.hostname) &&
            ['/api/chat', '/v1/chat/completions'].includes(url.pathname)
          ) {
            requestBody = JSON.parse(data.postData() ?? '{}');
          }
        }
      });
      await cell?.pressSequentially(content);

      // Ghost text should be visible as suggestion.
      // Retry by typing more content if ghost text doesn't appear
      const ghostText = cell!.locator('.jp-GhostText');
      let retries = 0;
      let ghostTextVisible = false;

      while (retries < maxRetries && !ghostTextVisible) {
        try {
          await expect(ghostText).toBeVisible({ timeout: RETRY_TIMEOUT });
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
      await expect(ghostText).toBeVisible({ timeout: RETRY_TIMEOUT });
      await expect(ghostText).not.toBeEmpty();

      expect(requestBody).toHaveProperty('messages');
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[1].content).toContain(content);
    });
  })
);

test.describe('#CompletionStatus', () => {
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

  test('should have a completion status indicator', async ({ page }) => {
    await expect(page.locator('.jp-ai-completion-status')).toBeVisible();
  });

  test('completion status indicator should be enabled', async ({ page }) => {
    const model =
      DEFAULT_GENERIC_PROVIDER_SETTINGS['@jupyterlite/ai:settings-model']
        .providers[0].model;
    const component = page.locator(
      '.jp-ai-completion-status > div:first-child'
    );
    await expect(component).not.toHaveClass(/jp-ai-completion-disabled/);
    await expect(component).toHaveAttribute(
      'title',
      `Completion using ${model}`
    );
  });

  test('completion status should toggle', async ({ page }) => {
    const model =
      DEFAULT_GENERIC_PROVIDER_SETTINGS['@jupyterlite/ai:settings-model']
        .providers[0].model;
    const name =
      DEFAULT_GENERIC_PROVIDER_SETTINGS['@jupyterlite/ai:settings-model']
        .providers[0].name;
    const component = page.locator(
      '.jp-ai-completion-status > div:first-child'
    );

    // Open the settings panel
    const settingsPanel = page.locator('#jupyterlite-ai-settings');
    await page.keyboard.press('Control+Shift+c');
    await page
      .locator(
        '#modal-command-palette li[data-command="@jupyterlite/ai:open-settings"]'
      )
      .click();
    // Do not use the same provider for chat and completion
    await settingsPanel.getByRole('switch').first().click();

    // Expect the completion to be disabled
    await expect(component).toHaveClass(/jp-ai-completion-disabled/);
    await expect(component).toHaveAttribute('title', 'No completion');

    // Select back a model and expect the completion to be enabled
    await settingsPanel.locator('.jp-ai-completion-provider-select').click();
    await page.getByRole('option', { name }).click();
    await expect(component).not.toHaveClass(/jp-ai-completion-disabled/);
    await expect(component).toHaveAttribute(
      'title',
      `Completion using ${model}`
    );

    // Disable manually the completion
    await settingsPanel.locator('.jp-ai-completion-provider-select').click();
    await page.getByRole('option', { name: 'No completion' }).click();
    await expect(component).toHaveClass(/jp-ai-completion-disabled/);
  });
});
