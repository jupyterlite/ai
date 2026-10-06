import { test, expect } from '@playwright/test';

test('chat icon is present in JupyterLite', async ({ page }) => {
  await page.goto('/lab/index.html');

  // Wait for JupyterLite to fully load
  await expect(page.locator('.jp-LabShell')).toBeVisible({ timeout: 60_000 });

  // The jupyterlab-chat-extension adds a chat panel button to the left sidebar
  await expect(page.locator('[title="Jupyter Chat"]')).toBeVisible({
    timeout: 10_000
  });
});
