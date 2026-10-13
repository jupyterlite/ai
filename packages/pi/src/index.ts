import { IPersonaSessionRegistry } from '@jupyter-ai/persona-manager';
import type { PersonaSessionRegistry } from '@jupyter-ai/persona-manager';
import { IChatTracker, type IChatPanel } from '@jupyter/chat';
import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IFileBrowserFactory, type FileBrowser } from '@jupyterlab/filebrowser';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { folderFavoriteIcon } from '@jupyterlab/ui-components';
import { IAISettingsModel, IToolRegistry } from '@jupyternaut/agent';
import { IComponentsRendererFactory } from 'jupyter-chat-components';
import { IMcpManager } from 'jupyter-mcp-manager';

import { PiAgent } from './agent';
import { AgentFolderDrive } from './folder';
// The chats that are already open get the persona at activation.
// eslint-disable-next-line jupyter/prefer-lazy-imports
import { attachPiChat } from './persona';
import { AGENT_DRIVE, IPiAgent } from './tokens';

namespace CommandIds {
  export const addProvider = '@jupyternaut/pi:add-provider';
  export const openAgentFolder = '@jupyternaut/pi:open-agent-folder';
}

const SETTINGS_FILE = `${AGENT_DRIVE}:settings.json`;

/**
 * The pi agent, and the command to add a model provider.
 */
const agentPlugin: JupyterFrontEndPlugin<IPiAgent> = {
  id: '@jupyternaut/pi:agent',
  description: 'The pi coding agent',
  autoStart: true,
  provides: IPiAgent,
  optional: [
    IToolRegistry,
    IAISettingsModel,
    IMcpManager,
    ICommandPalette,
    IDocumentManager,
    ITranslator
  ],
  activate: (
    app: JupyterFrontEnd,
    toolRegistry: IToolRegistry | null,
    settingsModel: IAISettingsModel | null,
    mcpManager: IMcpManager | null,
    palette: ICommandPalette | null,
    documentManager: IDocumentManager | null,
    translator: ITranslator | null
  ): IPiAgent => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const agent = new PiAgent({
      app,
      toolRegistry: toolRegistry ?? undefined,
      settingsModel: settingsModel ?? undefined,
      mcpManager: mcpManager ?? undefined,
      documentManager: documentManager ?? undefined,
      translator: translator ?? undefined
    });
    app.commands.addCommand(CommandIds.addProvider, {
      label: trans.__('Pi: Add a Model Provider'),
      caption: trans.__(
        'Add an API key, sign in with OpenRouter, or add an OpenAI-compatible endpoint'
      ),
      describedBy: { args: { type: 'object', properties: {} } },
      execute: async () => (await agent.load()).host.addProvider()
    });
    palette?.addItem({
      command: CommandIds.addProvider,
      category: trans.__('Pi')
    });
    return agent;
  }
};

/**
 * pi as a persona of the chats, next to Jupyternaut.
 */
const personaPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/pi:persona',
  description: 'Add pi to the personas of the chats',
  autoStart: true,
  requires: [IPiAgent],
  optional: [
    IChatTracker,
    IPersonaSessionRegistry,
    IComponentsRendererFactory,
    ITranslator
  ],
  activate: (
    app: JupyterFrontEnd,
    agent: IPiAgent,
    chatTracker: IChatTracker | null,
    registry: PersonaSessionRegistry | null,
    componentsFactory: IComponentsRendererFactory | null,
    translator: ITranslator | null
  ): void => {
    if (!chatTracker || !registry || !(agent instanceof PiAgent)) {
      return;
    }
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const attach = (panel: IChatPanel) =>
      attachPiChat(panel, agent, registry, { shell: app.shell, trans });
    chatTracker.forEach(attach);
    chatTracker.widgetAdded.connect((sender, panel) => attach(panel));

    componentsFactory?.addCallbacks({
      toolCallPermissionDecision: (targetId, toolCallId, optionId) => {
        agent.loadedRuntime?.decideApproval(targetId, toolCallId, optionId);
      }
    });
  }
};

/**
 * The pi agent folder as the `pi` drive, and the command to show it in a file
 * browser.
 */
const agentFolderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/pi:agent-folder',
  description: 'Show the pi agent folder in a file browser',
  autoStart: true,
  requires: [IPiAgent],
  optional: [
    IFileBrowserFactory,
    IDocumentManager,
    ICommandPalette,
    ITranslator
  ],
  activate: (
    app: JupyterFrontEnd,
    agent: IPiAgent,
    browserFactory: IFileBrowserFactory | null,
    documentManager: IDocumentManager | null,
    palette: ICommandPalette | null,
    translator: ITranslator | null
  ): void => {
    if (!(agent instanceof PiAgent)) {
      return;
    }
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const { contents, serverSettings } = app.serviceManager;
    contents.addDrive(new AgentFolderDrive(agent, serverSettings));
    let browser: FileBrowser | undefined;
    app.commands.addCommand(CommandIds.openAgentFolder, {
      label: trans.__('Pi: Open the Agent Folder'),
      caption: trans.__(
        'Show the settings, credentials, sessions and skills of pi'
      ),
      describedBy: { args: { type: 'object', properties: {} } },
      execute: async () => {
        if (browserFactory) {
          if (!browser || browser.isDisposed) {
            browser = browserFactory.createFileBrowser('pi-agent-folder', {
              driveName: AGENT_DRIVE
            });
            browser.title.caption = trans.__('Pi Agent Folder');
            browser.title.icon = folderFavoriteIcon;
            app.shell.add(browser, 'left', { rank: 300 });
          }
          app.shell.activateById(browser.id);
        } else if (documentManager) {
          await contents.get(SETTINGS_FILE, { content: false }).catch(() =>
            contents.save(SETTINGS_FILE, {
              type: 'file',
              format: 'text',
              content: '{}\n'
            })
          );
          documentManager.openOrReveal(SETTINGS_FILE);
        }
      }
    });
    palette?.addItem({
      command: CommandIds.openAgentFolder,
      category: trans.__('Pi')
    });
  }
};

export default [agentPlugin, personaPlugin, agentFolderPlugin];

export { IPiAgent } from './tokens';
