import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import type { IExternalRunContext } from '@jupyterlite/cockle';
import { ILiteTerminalAPIClient } from '@jupyterlite/terminal';
import {
  IAgentManagerFactory,
  IAISettingsModel,
  IProviderRegistry,
  IToolRegistry
} from '@jupyternaut/agent';

import { TerminalSessionManager } from './session';

const COMMAND_NAME = 'jupyternaut';
const COMMAND_ALIAS = 'ai';
const PLUGIN_ID = '@jupyternaut/terminal:plugin';

/**
 * Whether the terminal renders on a dark background, from the theme of the
 * terminal widgets and, when they inherit, the JupyterLab theme.
 */
function isDarkMode(): boolean {
  const theme = document
    .querySelector('.jp-Terminal')
    ?.getAttribute('data-term-theme');
  if (theme === 'dark' || theme === 'light') {
    return theme === 'dark';
  }
  return document.body.dataset.jpThemeLight === 'false';
}

/**
 * Register the `jupyternaut` command in JupyterLite terminals.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'Jupyternaut coding agent as a command in the JupyterLite terminal',
  autoStart: true,
  requires: [ILiteTerminalAPIClient, IAgentManagerFactory, IAISettingsModel],
  optional: [IProviderRegistry, IToolRegistry],
  activate: (
    app: JupyterFrontEnd,
    client: ILiteTerminalAPIClient,
    agentFactory: IAgentManagerFactory,
    settingsModel: IAISettingsModel,
    providerRegistry: IProviderRegistry | null,
    toolRegistry: IToolRegistry | null
  ): void => {
    const sessions = new TerminalSessionManager({
      app,
      agentFactory,
      settingsModel,
      providerRegistry: providerRegistry ?? undefined,
      toolRegistry: toolRegistry ?? undefined,
      isDarkMode
    });
    client.registerExternalCommand({
      name: COMMAND_NAME,
      command: (context: IExternalRunContext) => sessions.run(context)
    });
    client.registerAlias(COMMAND_ALIAS, COMMAND_NAME);
    client.terminalDisposed.connect((sender, shellId) =>
      sessions.dispose(shellId)
    );
  }
};

export default plugin;
