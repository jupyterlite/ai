import { IPersonaSessionRegistry } from '@jupyter-ai/persona-manager';
import type { PersonaSessionRegistry } from '@jupyter-ai/persona-manager';
import { IChatTracker, type IChatPanel } from '@jupyter/chat';
import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { IAISettingsModel, IToolRegistry } from '@jupyternaut/agent';
import { IComponentsRendererFactory } from 'jupyter-chat-components';
import { IMcpManager } from 'jupyter-mcp-manager';

import { PiAgent } from './agent';
// The chats that are already open get the persona at activation.
// eslint-disable-next-line jupyter/prefer-lazy-imports
import { attachPiChat } from './persona';
import { IPiAgent } from './tokens';

namespace CommandIds {
  export const addProvider = '@jupyternaut/pi:add-provider';
  export const openAgentFolder = '@jupyternaut/pi:open-agent-folder';
}

const GO_TO_PATH = 'filebrowser:go-to-path';

/**
 * The pi agent, and the commands to add a model provider and to show the
 * agent folder.
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
    app.commands.addCommand(CommandIds.openAgentFolder, {
      label: trans.__('Pi: Open the Agent Folder'),
      caption: trans.__(
        'Show the settings, sessions, skills and extensions of pi in the file browser'
      ),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => app.commands.hasCommand(GO_TO_PATH),
      execute: async () => {
        const path = await (await agent.load()).host.createAgentFolder();
        await app.commands.execute(GO_TO_PATH, { path });
      }
    });
    for (const command of [
      CommandIds.addProvider,
      CommandIds.openAgentFolder
    ]) {
      palette?.addItem({ command, category: trans.__('Pi') });
    }
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

export default [agentPlugin, personaPlugin];

export { IPiAgent } from './tokens';
