import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

async function openChatPanel(page: IJupyterLabPageFixture): Promise<Locator> {
  const panel = page.locator('[id="@jupyterlite/ai:chat-widget"]');
  if (!(await panel.isVisible())) {
    const chatIcon = page.getByTitle('Jupyterlite AI Chat');
    await chatIcon.click();
    await page.waitForCondition(() => panel.isVisible());
  }
  return panel;
}

test.describe('Chat panel without model', () => {
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
