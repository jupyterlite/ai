/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import { DEFAULT_SETTINGS_MODEL_SETTINGS, openChatPanel } from './test-utils';

const MCP_SERVER_PORT = 8765;
const MCP_SERVER_URL = `http://0.0.0.0:${MCP_SERVER_PORT}/mcp`;

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
      // To nudge the (relatively small) model to call the tools
      systemPrompt: 'Just call the tools you are asked to call',
      mcpServers: [
        {
          id: 'test-mcp-server',
          name: 'Test MCP Server',
          url: MCP_SERVER_URL,
          enabled: true
        }
      ]
    }
  }
});

const PROMPT = 'Use the process_data tool to process the text "hello world"';

test.describe('#mcpIntegration', () => {
  test('should display tool call from MCP server', async ({ page }) => {
    test.setTimeout(120 * 1000);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );

    await input.pressSequentially(PROMPT);
    await sendButton.click();

    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: 60000 });

    // Wait for tool call to appear
    const toolCall = panel.locator('.jp-ai-tool-call');
    await expect(toolCall).toHaveCount(1, { timeout: 30000 });

    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: 60000 });
    await expect(toolCall).toContainText('process_data');
    await expect(toolCall).toContainText('Processed: hello world');
  });

  test('should show MCP server as Connected in AI Settings', async ({
    page
  }) => {
    const panel = await openChatPanel(page);

    const settingsButton = panel.getByTitle('Open AI Settings');
    await settingsButton.click();

    const settingsPanel = page.locator('#jupyterlite-ai-settings');
    await expect(settingsPanel).toBeVisible();

    const mcpServersTab = settingsPanel.getByRole('tab', {
      name: /MCP Servers/i
    });
    await mcpServersTab.click();

    await expect(settingsPanel.locator('text=Test MCP Server')).toBeVisible();
    await expect(settingsPanel.locator('text=Status: Connected')).toBeVisible();
  });
});
