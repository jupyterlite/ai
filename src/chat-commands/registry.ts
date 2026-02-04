import { JupyterFrontEndPlugin } from '@jupyterlab/application';

import { ChatCommandRegistry, IChatCommandRegistry } from '@jupyter/chat';

export const chatCommandRegistryPlugin: JupyterFrontEndPlugin<IChatCommandRegistry> =
  {
    id: '@jupyterlite/ai:chat-command-registry',
    description: 'Provide the chat command registry for JupyterLite AI.',
    autoStart: true,
    provides: IChatCommandRegistry,
    activate: () => {
      return new ChatCommandRegistry();
    }
  };
