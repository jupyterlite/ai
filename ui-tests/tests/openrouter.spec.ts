/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { createHash } from 'crypto';

import {
  expect,
  galata,
  IJupyterLabPageFixture,
  test
} from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

import { openChatPanel } from './test-utils';

const AUTH_URL = 'https://openrouter.ai/auth';
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';
const MODELS_URL = 'https://openrouter.ai/api/v1/models?*';
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CONNECT_BUTTON = 'Connect with OpenRouter';
const MODELS = [
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna:batch',
  'test/only-from-api'
];

/**
 * Open the dialog to add a provider, and select the OpenRouter provider.
 */
async function openOpenRouterDialog(
  page: IJupyterLabPageFixture
): Promise<Locator> {
  await page.evaluate(async () => {
    await window.jupyterapp.commands.execute(
      '@jupyternaut/persona:open-settings'
    );
  });
  await page.getByRole('button', { name: 'Add Provider' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add New Provider' });
  await dialog.locator('.MuiSelect-select').click();
  await page.getByRole('option', { name: /^OpenRouter/ }).click();
  return dialog;
}

/**
 * Click on the connect button and wait until the popup window closes.
 *
 * The OpenRouter authorization page is replaced by a page that redirects to
 * the callback URL, with the given code if any. Returns the URL of the
 * authorization page.
 */
async function connect(
  page: IJupyterLabPageFixture,
  dialog: Locator,
  code: string | null
): Promise<URL> {
  let authUrl: URL | undefined;
  await page.context().route(`${AUTH_URL}?*`, route => {
    authUrl = new URL(route.request().url());
    const callbackUrl = new URL(authUrl.searchParams.get('callback_url')!);
    if (code) {
      callbackUrl.searchParams.set('code', code);
    }
    return route.fulfill({
      contentType: 'text/html',
      body: `<script>location.replace(${JSON.stringify(callbackUrl)})</script>`
    });
  });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    dialog.getByRole('button', { name: CONNECT_BUTTON }).click()
  ]);
  if (!popup.isClosed()) {
    await popup.waitForEvent('close');
  }
  return authUrl!;
}

test.beforeEach(async ({ page }) => {
  await page.route(MODELS_URL, route =>
    route.fulfill({ json: { data: MODELS.map(id => ({ id })) } })
  );
});

test.describe('#openrouter', () => {
  test('should show the connect button for OpenRouter only', async ({
    page
  }) => {
    const dialog = await openOpenRouterDialog(page);
    const button = dialog.getByRole('button', { name: CONNECT_BUTTON });
    await expect(button).toBeVisible();
    await expect(dialog.getByLabel('API Key')).toBeVisible();

    await dialog.locator('.MuiSelect-select').click();
    await page.getByRole('option', { name: /^OpenAI/ }).click();
    await expect(button).toHaveCount(0);
  });

  test('should list the models fetched from OpenRouter', async ({ page }) => {
    const dialog = await openOpenRouterDialog(page);
    const model = dialog.getByRole('combobox', { name: 'Model' });
    await expect(model).toHaveValue(MODELS[0]);

    await model.click();
    await expect(
      page.getByRole('option', { name: 'test/only-from-api' })
    ).toBeVisible();
    await expect(page.getByRole('option', { name: /:batch$/ })).toHaveCount(0);

    await model.fill('luna');
    await expect(page.getByRole('option')).toHaveText(['openai/gpt-5.6-luna']);
  });

  test('should accept a typed model when the fetch fails', async ({ page }) => {
    await page.route(MODELS_URL, route => route.abort());
    const dialog = await openOpenRouterDialog(page);
    const model = dialog.getByRole('combobox', { name: 'Model' });
    const button = dialog.getByRole('button', { name: CONNECT_BUTTON });
    await expect(model).toHaveValue('');
    await expect(button).toBeDisabled();

    await model.fill('openrouter/auto');
    await expect(button).toBeEnabled();
  });

  test('should open the OpenRouter authorization page in a popup', async ({
    page
  }) => {
    // JupyterLab removes the `reset` parameter set by Galata after it starts.
    await page.waitForURL(url => !url.searchParams.has('reset'));
    const pageUrl = page.url();
    const dialog = await openOpenRouterDialog(page);
    const authUrl = await connect(page, dialog, null);

    const params = authUrl.searchParams;
    expect(params.get('callback_url')).toBe(pageUrl);
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('key_label')).toBe('JupyterLite AI');
  });

  test('should save the provider without a page reload', async ({ page }) => {
    const exchanges: Record<string, string>[] = [];
    await page.route(KEYS_URL, route => {
      exchanges.push(route.request().postDataJSON());
      return route.fulfill({ json: { key: 'sk-or-v1-test' } });
    });
    await page.evaluate(() => {
      (window as any).isSamePage = true;
    });

    const dialog = await openOpenRouterDialog(page);
    await dialog.getByLabel('Provider Name').fill('My OpenRouter');
    const authUrl = await connect(page, dialog, 'test-code');

    await expect(
      page.locator('.Toastify__toast', { hasText: 'Connected to OpenRouter' })
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'My OpenRouter' })
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).isSamePage)).toBe(true);

    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].code).toBe('test-code');
    expect(exchanges[0].code_challenge_method).toBe('S256');
    const challenge = createHash('sha256')
      .update(exchanges[0].code_verifier)
      .digest('base64url');
    expect(challenge).toBe(authUrl.searchParams.get('code_challenge'));
  });

  test('should save the provider when the popup has no opener', async ({
    page
  }) => {
    // A login page with a Cross-Origin-Opener-Policy cuts the opener link.
    await page.context().addInitScript(() => {
      window.opener = null;
    });
    await page.route(KEYS_URL, route =>
      route.fulfill({ json: { key: 'sk-or-v1-test' } })
    );

    const dialog = await openOpenRouterDialog(page);
    await dialog.getByLabel('Provider Name').fill('My OpenRouter');
    await connect(page, dialog, 'test-code');

    await expect(
      page.locator('.Toastify__toast', { hasText: 'Connected to OpenRouter' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'My OpenRouter' })
    ).toBeVisible();
  });

  test('should keep the dialog open when the request is denied', async ({
    page
  }) => {
    let exchanged = false;
    await page.route(KEYS_URL, route => {
      exchanged = true;
      return route.fulfill({ json: { key: 'sk-or-v1-test' } });
    });

    const dialog = await openOpenRouterDialog(page);
    await connect(page, dialog, null);

    await expect(dialog).toBeVisible();
    expect(exchanged).toBe(false);
    await expect(
      page.locator('.Toastify__toast', { hasText: 'OpenRouter' })
    ).toHaveCount(0);
  });

  test('should cancel the connection when the popup is closed', async ({
    page
  }) => {
    let exchanged = false;
    await page.route(KEYS_URL, route => {
      exchanged = true;
      return route.fulfill({ json: { key: 'sk-or-v1-test' } });
    });
    await page
      .context()
      .route(`${AUTH_URL}?*`, route =>
        route.fulfill({ contentType: 'text/html', body: '<p>OpenRouter</p>' })
      );

    const dialog = await openOpenRouterDialog(page);
    const button = dialog.getByRole('button', { name: CONNECT_BUTTON });
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      button.click()
    ]);
    await expect(
      dialog.getByRole('button', { name: 'Connecting to OpenRouter...' })
    ).toBeDisabled();

    await popup.close();
    await expect(button).toBeEnabled();
    await expect(dialog).toBeVisible();
    expect(exchanged).toBe(false);
  });

  test('should report a failed exchange', async ({ page }) => {
    await page.route(KEYS_URL, route =>
      route.fulfill({
        status: 403,
        json: { error: { code: 403, message: 'Invalid code or code_verifier' } }
      })
    );

    const dialog = await openOpenRouterDialog(page);
    await connect(page, dialog, 'bad-code');

    await expect(
      page.locator('.Toastify__toast', {
        hasText:
          'Failed to connect to OpenRouter: Invalid code or code_verifier'
      })
    ).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('should report a blocked popup', async ({ page }) => {
    await page.evaluate(() => {
      window.open = () => null;
    });

    const dialog = await openOpenRouterDialog(page);
    await dialog.getByRole('button', { name: CONNECT_BUTTON }).click();

    await expect(
      page.locator('.Toastify__toast', {
        hasText: 'The browser blocked the OpenRouter window'
      })
    ).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('should ignore a code parameter outside of the popup', async ({
    page
  }) => {
    let exchanged = false;
    await page.route(KEYS_URL, route => {
      exchanged = true;
      return route.fulfill({ json: { key: 'sk-or-v1-test' } });
    });

    const url = new URL(page.url());
    url.searchParams.set('code', 'unrelated');
    await page.goto(url.toString());

    await expect(page.locator('.jp-Launcher')).toBeVisible();
    expect(exchanged).toBe(false);
    await expect(
      page.locator('.Toastify__toast', { hasText: 'OpenRouter' })
    ).toHaveCount(0);
  });
});

test.describe('#openrouterAppAttribution', () => {
  const appAttribution = { name: 'My App', url: 'https://example.org/my-app' };

  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      '@jupyternaut/persona:settings-model': {
        appAttribution,
        defaultProvider: 'openrouter-test',
        providers: [
          {
            id: 'openrouter-test',
            name: 'OpenRouter',
            provider: 'openrouter',
            model: 'test/only-from-api',
            apiKey: 'sk-or-v1-test'
          }
        ],
        useSecretsManager: false
      }
    }
  });

  test('should label the API key with the app name', async ({ page }) => {
    const dialog = await openOpenRouterDialog(page);
    const authUrl = await connect(page, dialog, null);

    expect(authUrl.searchParams.get('key_label')).toBe(appAttribution.name);
  });

  test('should send the app attribution with the requests', async ({
    page
  }) => {
    await page.route(CHAT_URL, route =>
      route.fulfill({
        status: 401,
        json: { error: { code: 401, message: 'User not found.' } }
      })
    );

    const panel = await openChatPanel(page);
    await panel
      .locator('.jp-chat-input-container')
      .getByRole('combobox')
      .pressSequentially('Hello');
    const [request] = await Promise.all([
      page.waitForRequest(CHAT_URL),
      panel.locator('.jp-chat-input-container .jp-chat-send-button').click()
    ]);

    const headers = request.headers();
    expect(headers['http-referer']).toBe(appAttribution.url);
    expect(headers['x-openrouter-title']).toBe(appAttribution.name);
    expect(headers['authorization']).toBe('Bearer sk-or-v1-test');
  });
});
