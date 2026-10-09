import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ILiteTerminalAPIClient } from '@jupyterlite/terminal';
import { IPiAgent } from '@jupyternaut/pi';

/**
 * Register the `pi` command (and its `ai` alias) in JupyterLite terminals.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyternaut/terminal:plugin',
  description: 'The pi coding agent as a command in the JupyterLite terminal',
  autoStart: true,
  requires: [ILiteTerminalAPIClient, IPiAgent],
  activate: (
    app: JupyterFrontEnd,
    client: ILiteTerminalAPIClient,
    agent: IPiAgent
  ): void => {
    client.registerExternalCommand({
      name: 'pi',
      command: context => agent.runTerminal(context)
    });
    client.registerAlias('ai', 'pi');
    client.terminalDisposed.connect((sender, shellId) =>
      agent.stopTerminal(shellId)
    );
  }
};

export default plugin;
