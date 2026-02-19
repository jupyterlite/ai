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
import { DEFAULT_GENERIC_PROVIDER_SETTINGS, openChatPanel } from './test-utils';

const EXPECT_TIMEOUT = 120000;
const TEST_MIME_BUNDLE_COMMAND_ID = 'jupyterlite-ai-tests:emit-mime-bundle';
const BASE_SETTINGS =
  DEFAULT_GENERIC_PROVIDER_SETTINGS['@jupyterlite/ai:settings-model'];
const PROVIDERS = BASE_SETTINGS.providers.map(provider => {
  if (provider.id !== 'generic-functiongemma') {
    return provider;
  }
  return {
    ...provider,
    parameters: {
      ...(provider as { parameters?: Record<string, unknown> }).parameters,
      temperature: 0
    }
  };
});

test.use({
  mockSettings: {
    ...galata.DEFAULT_SETTINGS,
    '@jupyterlab/apputils-extension:notification': {
      checkForUpdates: false,
      fetchNews: 'false',
      doNotDisturbMode: true
    },
    '@jupyterlite/ai:settings-model': {
      ...BASE_SETTINGS,
      providers: PROVIDERS,
      toolsEnabled: true,
      defaultProvider: 'generic-functiongemma',
      commandsAutoRenderMimeBundles: [TEST_MIME_BUNDLE_COMMAND_ID],
      systemPrompt:
        'When asked to execute a command, call execute_command exactly once with this input shape: {"commandId":"jupyterlite-ai-tests:emit-mime-bundle"} and no args. Do not call any other tools and do not ask follow-up questions.'
    }
  }
});

async function registerTestMimeBundleCommand(
  page: IJupyterLabPageFixture
): Promise<void> {
  await page.evaluate(
    ({ commandId }) => {
      const app = window.jupyterapp;

      if (app.commands.hasCommand(commandId)) {
        return;
      }

      app.commands.addCommand(commandId, {
        label: 'Emit MIME bundle for UI tests',
        execute: () => ({
          outputs: [
            {
              output_type: 'display_data',
              data: {
                'application/json': {
                  ok: true,
                  source: 'ui-test-command'
                }
              },
              metadata: {}
            }
          ]
        })
      });
    },
    { commandId: TEST_MIME_BUNDLE_COMMAND_ID }
  );
}

test.describe('#mimeBundles', () => {
  test('should render MIME bundles from configured command outputs in chat', async ({
    page
  }) => {
    test.setTimeout(180 * 1000);
    await registerTestMimeBundleCommand(page);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );

    const prompt = `Call execute_command exactly once with commandId "${TEST_MIME_BUNDLE_COMMAND_ID}". Do not provide args.`;

    await input.pressSequentially(prompt);
    await sendButton.click();

    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    const executeToolCall = panel
      .locator('.jp-ai-tool-call')
      .filter({ hasText: TEST_MIME_BUNDLE_COMMAND_ID });
    await expect(executeToolCall).toHaveCount(1, { timeout: EXPECT_TIMEOUT });
    await expect(executeToolCall).toContainText('execute_command', {
      timeout: EXPECT_TIMEOUT
    });
    await expect(executeToolCall).toContainText(
      `"commandId": "${TEST_MIME_BUNDLE_COMMAND_ID}"`,
      {
        timeout: EXPECT_TIMEOUT
      }
    );
    await expect(executeToolCall).not.toContainText('"args": "', {
      timeout: EXPECT_TIMEOUT
    });

    const renderedJson = panel.locator(
      '.jp-chat-rendered-message .jp-RenderedJSON'
    );
    await expect(renderedJson).toHaveCount(1, { timeout: EXPECT_TIMEOUT });
  });

  test('should allow follow-up messages after MIME bundle auto-render', async ({
    page
  }) => {
    test.setTimeout(180 * 1000);
    await registerTestMimeBundleCommand(page);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const renderedJson = panel.locator(
      '.jp-chat-rendered-message .jp-RenderedJSON'
    );

    const prompt = `Call execute_command exactly once with commandId "${TEST_MIME_BUNDLE_COMMAND_ID}". Do not provide args.`;

    await input.pressSequentially(prompt);
    await expect(sendButton).toBeEnabled({ timeout: EXPECT_TIMEOUT });
    await sendButton.click();
    await expect(renderedJson).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    const stopButton = panel.getByTitle('Stop streaming');
    await expect(stopButton).toHaveCount(0, { timeout: EXPECT_TIMEOUT });

    await input.click();
    await input.pressSequentially(prompt);
    await expect(sendButton).toBeEnabled({ timeout: EXPECT_TIMEOUT });
    await sendButton.click();

    const executeToolCalls = panel
      .locator('.jp-ai-tool-call')
      .filter({ hasText: TEST_MIME_BUNDLE_COMMAND_ID });
    await expect(executeToolCalls).toHaveCount(2, { timeout: EXPECT_TIMEOUT });
    await expect(renderedJson).toHaveCount(2, { timeout: EXPECT_TIMEOUT });
    await expect(
      panel.locator(
        '.jp-chat-message-content:has-text("Error generating response:")'
      )
    ).toHaveCount(0);
  });
});
