/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import { DEFAULT_SETTINGS_MODEL_SETTINGS, openChatPanel } from './test-utils';

test.use({
  mockSettings: {
    ...galata.DEFAULT_SETTINGS,
    '@jupyterlab/apputils-extension:notification': {
      checkForUpdates: false,
      fetchNews: 'false',
      doNotDisturbMode: true
    },
    '@jupyterlite/ai:settings-model': {
      ...DEFAULT_SETTINGS_MODEL_SETTINGS['@jupyterlite/ai:settings-model'],
      toolsEnabled: true,
      // To nudge the model to call the tool with specific parameters
      systemPrompt:
        'When asked to discover commands, call the discover_commands tool with the exact query parameter provided in the user message. Always use the query parameter exactly as specified.'
    }
  }
});

test.describe('#commandsTool', () => {
  test('should filter commands using query parameter', async ({ page }) => {
    test.setTimeout(120 * 1000);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );

    // Very specific prompt to ensure the query parameter is used
    const PROMPT =
      'Use the discover_commands tool with query parameter set to "notebook" to find notebook-related commands';

    await input.pressSequentially(PROMPT);
    await sendButton.click();

    // Wait for AI response
    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: 60000 });

    // Wait for tool call to appear
    const toolCall = panel.locator('.jp-ai-tool-call');
    await expect(toolCall).toHaveCount(1, { timeout: 30000 });

    // Verify the tool was called
    await expect(toolCall).toContainText('discover_commands');

    // Click to expand the tool call
    await toolCall.click();

    // Get the tool call result to check the command count
    const toolResultText = await toolCall.textContent();

    // Parse the commandCount from the JSON response
    const countMatch = toolResultText?.match(/"commandCount":\s*(\d+)/);
    expect(countMatch).toBeTruthy();
    const count = parseInt(countMatch![1], 10);

    // The filtered results should have significantly fewer than 300 commands
    // (JupyterLab typically has 300+ total commands, but only a subset contain "notebook")
    expect(count).toBeLessThan(300);
    expect(count).toBeGreaterThan(0);
  });

  test('should return all commands without query parameter', async ({
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

    // Prompt without specifying a query parameter
    const PROMPT =
      'Use the discover_commands tool without any query parameter to list all available commands';

    await input.pressSequentially(PROMPT);
    await sendButton.click();

    // Wait for AI response
    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: 60000 });

    // Wait for tool call to appear
    const toolCall = panel.locator('.jp-ai-tool-call');
    await expect(toolCall).toHaveCount(1, { timeout: 30000 });

    // Verify the tool was called
    await expect(toolCall).toContainText('discover_commands');

    // Click to expand the tool call
    await toolCall.click();

    // Get the tool call result to check the command count
    const toolResultText = await toolCall.textContent();

    // Parse the commandCount from the JSON response
    const countMatch = toolResultText?.match(/"commandCount":\s*(\d+)/);
    expect(countMatch).toBeTruthy();
    const count = parseInt(countMatch![1], 10);

    // Should have many commands (typically 400+)
    expect(count).toBeGreaterThan(400);
  });
});
