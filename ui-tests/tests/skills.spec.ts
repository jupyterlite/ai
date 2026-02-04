/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { expect, galata, test } from '@jupyterlab/galata';
import { DEFAULT_GENERIC_PROVIDER_SETTINGS, openChatPanel } from './test-utils';

const EXPECT_TIMEOUT = 120000;
const EXPECTED_SKILL_COMMAND = 'skills:agent-helper';
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
      skillsPath: '.agents/skills',
      defaultProvider: 'generic-functiongemma',
      systemPrompt:
        'When asked to load a skill, call discover_commands with query "skills", then execute_command with commandId "skills:agent-helper". Do not ask follow-up questions.'
    }
  }
});

test.describe('#skills', () => {
  test('should follow instructions from a skill', async ({ page }) => {
    test.setTimeout(EXPECT_TIMEOUT);

    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );

    const prompt =
      'Load the agent-helper skill using discover_commands with query "skills", then execute_command with commandId "skills:agent-helper".';

    await input.pressSequentially(prompt);
    await sendButton.click();

    await expect(
      panel.locator('.jp-chat-message-header:has-text("Jupyternaut")')
    ).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    const toolCalls = panel.locator('.jp-ai-tool-call');
    const discoverCall = toolCalls.filter({ hasText: 'discover_commands' });
    const skillCall = toolCalls.filter({
      hasText: /skills:\s*(?:<escape>)?agent-helper/
    });

    await expect(discoverCall).toHaveCount(1, { timeout: EXPECT_TIMEOUT });
    await expect(skillCall).toHaveCount(1, { timeout: EXPECT_TIMEOUT });

    await skillCall.first().click();
    const skillResultText = await skillCall.first().textContent();
    expect(skillResultText).toContain(EXPECTED_SKILL_COMMAND);
    expect(skillResultText).toContain('SKILL LOADED');

    const stopButton = panel.getByTitle('Stop streaming');
    await expect(stopButton).toHaveCount(0, { timeout: EXPECT_TIMEOUT });
  });
});
