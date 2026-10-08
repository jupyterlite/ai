import { IPersonaSessionRegistry } from '@jupyter-ai/persona-manager';
import type { PersonaSessionRegistry } from '@jupyter-ai/persona-manager';
import { IChatTracker, type IChatPanel } from '@jupyter/chat';
import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IAISettingsModel, IToolRegistry } from '@jupyternaut/agent';
import { IComponentsRendererFactory } from 'jupyter-chat-components';
import { IMcpManager } from 'jupyter-mcp-manager';

import { PiAgent } from './agent';
import { attachPiChat } from './persona';
import { IPiAgent } from './tokens';

namespace CommandIds {
  export const setApiKey = '@jupyternaut/pi:set-api-key';
  export const signIn = '@jupyternaut/pi:sign-in';
  export const addEndpoint = '@jupyternaut/pi:add-endpoint';
}

/**
 * The pi agent, and the commands to configure its model providers.
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
    IDocumentManager
  ],
  activate: (
    app: JupyterFrontEnd,
    toolRegistry: IToolRegistry | null,
    settingsModel: IAISettingsModel | null,
    mcpManager: IMcpManager | null,
    palette: ICommandPalette | null,
    documentManager: IDocumentManager | null
  ): IPiAgent => {
    const agent = new PiAgent({
      app,
      toolRegistry: toolRegistry ?? undefined,
      settingsModel: settingsModel ?? undefined,
      mcpManager: mcpManager ?? undefined,
      documentManager: documentManager ?? undefined
    });
    app.commands.addCommand(CommandIds.setApiKey, {
      label: 'Pi: Set a Model Provider API Key',
      describedBy: { args: { type: 'object', properties: {} } },
      execute: () => agent.configure('setApiKey')
    });
    app.commands.addCommand(CommandIds.signIn, {
      label: 'Pi: Sign In with an Account',
      describedBy: { args: { type: 'object', properties: {} } },
      execute: () => agent.configure('signIn')
    });
    app.commands.addCommand(CommandIds.addEndpoint, {
      label: 'Pi: Add an OpenAI-Compatible Endpoint',
      describedBy: { args: { type: 'object', properties: {} } },
      execute: () => agent.configure('addEndpoint')
    });
    for (const command of [
      CommandIds.setApiKey,
      CommandIds.signIn,
      CommandIds.addEndpoint
    ]) {
      palette?.addItem({ command, category: 'Pi' });
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
  optional: [IChatTracker, IPersonaSessionRegistry, IComponentsRendererFactory],
  activate: (
    app: JupyterFrontEnd,
    agent: IPiAgent,
    chatTracker: IChatTracker | null,
    registry: PersonaSessionRegistry | null,
    componentsFactory: IComponentsRendererFactory | null
  ): void => {
    if (!chatTracker || !registry || !(agent instanceof PiAgent)) {
      return;
    }
    const attach = (panel: IChatPanel) => attachPiChat(panel, agent, registry);
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
