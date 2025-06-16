import {
  expect,
  galata,
  IJupyterLabPageFixture,
  test
} from '@jupyterlab/galata';
import { Locator } from '@playwright/test';
import { openSettings } from './test-utils';

test.use({
  mockSettings: { ...galata.DEFAULT_SETTINGS }
});

async function openChatPanel(page: IJupyterLabPageFixture): Promise<Locator> {
  const panel = page.locator('[id="@jupyterlite/ai:chat-widget"]');
  if (!(await panel.isVisible())) {
    const chatIcon = page.getByTitle('Jupyterlite AI Chat').filter();
    await chatIcon.click();
    await page.waitForCondition(() => panel.isVisible());
  }
  return panel;
}

async function setUpOllama(page: IJupyterLabPageFixture) {
  const settingsPanel = await openSettings(page, 'AI provider');
  const provider = settingsPanel.locator(
    'select[name="jp-SettingsEditor-@jupyterlite/ai:provider-registry_provider"]'
  );
  await provider.selectOption('Ollama');
  const model = settingsPanel.locator(
    'input[name="jp-SettingsEditor-@jupyterlite/ai:provider-registry_model"]'
  );
  await model.scrollIntoViewIfNeeded();
  await model.pressSequentially('qwen2:0.5b');

  // wait for the provider to be set
  // FIX IT with a proper way to wait for it
  await page.waitForTimeout(3000);
}

test.describe('#withoutModel', () => {
  test('should contain the chat panel icon', async ({ page }) => {
    const chatIcon = page.getByTitle('Jupyterlite AI Chat');
    expect(chatIcon).toHaveCount(1);
    expect(await chatIcon.screenshot()).toMatchSnapshot('chat_icon.png');
  });

  test('should open the chat panel', async ({ page }) => {
    const chatIcon = page.getByTitle('Jupyterlite AI Chat');
    await chatIcon.click();
    await expect(
      page.locator('[id="@jupyterlite/ai:chat-widget"]')
    ).toBeVisible();
  });

  test('should have a welcome message', async ({ page }) => {
    const panel = await openChatPanel(page);
    expect(panel.locator('.jp-chat-welcome-message')).toHaveCount(1);
    expect(panel.locator('.jp-chat-welcome-message')).not.toBeEmpty();
  });

  test('should receive an error message', async ({ page }) => {
    const content = 'Hello';
    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const messages = panel.locator('.jp-chat-message');

    await input.pressSequentially(content);
    await sendButton.click();
    await expect(messages).toHaveCount(2);

    await expect(
      messages.first().locator('.jp-chat-rendered-markdown')
    ).toHaveText(content);

    await expect(messages.last().locator('.jp-chat-message-header')).toHaveText(
      /^ERROR/
    );
    await expect(
      messages.last().locator('.jp-chat-rendered-markdown')
    ).toHaveText('AI provider not configured');
  });
});

test.describe('#withModel', () => {
  test.beforeEach(async ({ page }) => {
    await setUpOllama(page);
  });

  test('should have a model', async ({ page }) => {
    const content = 'Which model are you built from ?';
    const panel = await openChatPanel(page);
    const input = panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox');
    const sendButton = panel.locator(
      '.jp-chat-input-container .jp-chat-send-button'
    );
    const messages = panel.locator('.jp-chat-message');

    await input.pressSequentially(content);
    await sendButton.click();
    await expect(messages).toHaveCount(2);

    await expect(messages.last().locator('.jp-chat-message-header')).toHaveText(
      /Jupyternaut/
    );
    await expect(
      messages.last().locator('.jp-chat-rendered-markdown')
    ).toHaveText(/ollama/, { ignoreCase: true });
  });
});
