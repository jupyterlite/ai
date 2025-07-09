/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

export const openSettings = async (
  page: IJupyterLabPageFixture,
  settings?: string
): Promise<Locator> => {
  const args = settings ? { query: settings } : {};
  await page.evaluate(async args => {
    await window.jupyterapp.commands.execute('settingeditor:open', args);
  }, args);

  // Activate the settings tab, sometimes it does not automatically.
  const settingsTab = page
    .getByRole('main')
    .getByRole('tab', { name: 'Settings', exact: true });
  await settingsTab.click();
  await page.waitForCondition(
    async () => (await settingsTab.getAttribute('aria-selected')) === 'true'
  );
  return (await page.activity.getPanelLocator('Settings')) as Locator;
};

export const setUpOllama = async (
  page: IJupyterLabPageFixture,
  model: string = 'qwen2:0.5b'
): Promise<void> => {
  // Expose a function to get a plugin.
  await page.evaluate(exposeDepsJs({ getPlugin }));

  const settingsPanel = await openSettings(page, 'AI provider');
  const providerSelect = settingsPanel.locator(
    'select[name="jp-SettingsEditor-@jupyterlite/ai:provider-registry-chat_provider"]'
  );
  await providerSelect.selectOption('Ollama');
  const modelInput = settingsPanel.locator(
    'input[name="jp-SettingsEditor-@jupyterlite/ai:provider-registry-chat_model"]'
  );

  await modelInput.scrollIntoViewIfNeeded();

  // Wait for the current provider to be updated.
  const promise = page.evaluate(async (): Promise<void> => {
    // Get the registry plugin and return a promise that resolves when the provider has
    // been updated in the registry.
    // Updating the Ollama model name trigger the change of settings, so the provider
    // registry updates the chat and completer models accordingly and emit a signal.
    const registry = await window.getPlugin(
      '@jupyterlite/ai:provider-registry'
    );

    return new Promise<void>(function (resolve, reject) {
      registry.providerChanged.connect(() => resolve());
    });
  });

  await modelInput.fill(model);
  return promise;
};

// Workaround to expose a function using 'window' in the browser context.
// Copied from https://github.com/puppeteer/puppeteer/issues/724#issuecomment-896755822
export const exposeDepsJs = (
  deps: Record<string, (...args: any) => any>
): string => {
  return Object.keys(deps)
    .map(key => {
      return `window["${key}"] = ${deps[key]};`;
    })
    .join('\n');
};

/**
 * The function running in browser context to get a plugin.
 *
 * This function does the same as the equivalent in InPage galata helper, without the
 * constraint on the plugin id.
 */
export const getPlugin = (pluginId: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const app = window.jupyterapp as any;
    const hasPlugin = app.hasPlugin(pluginId);

    if (hasPlugin) {
      try {
        // Compatibility with jupyterlab 4.3
        const plugin: any = app._plugins
          ? app._plugins.get(pluginId)
          : app.pluginRegistry._plugins.get(pluginId);
        if (plugin.activated) {
          resolve(plugin.service);
        } else {
          void app.activatePlugin(pluginId).then(response => {
            resolve(plugin.service);
          });
        }
      } catch (error) {
        console.error('Failed to get plugin', error);
      }
    }
  });
};
