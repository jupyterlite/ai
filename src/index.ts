import {
  ActiveCellManager,
  buildChatSidebar,
  buildErrorWidget,
  ChatCommandRegistry,
  IActiveCellManager,
  IChatCommandRegistry
} from '@jupyter/chat';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ReactWidget, IThemeManager } from '@jupyterlab/apputils';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IFormRendererRegistry } from '@jupyterlab/ui-components';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { ChatHandler } from './chat-handler';
import { CompletionProvider } from './completion-provider';
import { defaultProviderPlugins } from './default_providers';
import { AIProviderRegistry } from './provider';
import { aiSettingsRenderer } from './settings/panel';
import { IAIProviderRegistry } from './tokens';

const chatCommandRegistryPlugin: JupyterFrontEndPlugin<IChatCommandRegistry> = {
  id: '@jupyterlite/ai:autocompletion-registry',
  description: 'Autocompletion registry',
  autoStart: true,
  provides: IChatCommandRegistry,
  activate: () => {
    const registry = new ChatCommandRegistry();
    registry.addProvider(new ChatHandler.ClearCommandProvider());
    return registry;
  }
};

const chatPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:chat',
  description: 'LLM chat extension',
  autoStart: true,
  requires: [IAIProviderRegistry, IRenderMimeRegistry, IChatCommandRegistry],
  optional: [INotebookTracker, ISettingRegistry, IThemeManager],
  activate: async (
    app: JupyterFrontEnd,
    providerRegistry: IAIProviderRegistry,
    rmRegistry: IRenderMimeRegistry,
    chatCommandRegistry: IChatCommandRegistry,
    notebookTracker: INotebookTracker | null,
    settingsRegistry: ISettingRegistry | null,
    themeManager: IThemeManager | null
  ) => {
    let activeCellManager: IActiveCellManager | null = null;
    if (notebookTracker) {
      activeCellManager = new ActiveCellManager({
        tracker: notebookTracker,
        shell: app.shell
      });
    }

    const chatHandler = new ChatHandler({
      providerRegistry,
      activeCellManager
    });

    let sendWithShiftEnter = false;
    let enableCodeToolbar = true;
    let personaName = 'AI';

    function loadSetting(setting: ISettingRegistry.ISettings): void {
      sendWithShiftEnter = setting.get('sendWithShiftEnter')
        .composite as boolean;
      enableCodeToolbar = setting.get('enableCodeToolbar').composite as boolean;
      personaName = setting.get('personaName').composite as string;

      // set the properties
      chatHandler.config = { sendWithShiftEnter, enableCodeToolbar };
      chatHandler.personaName = personaName;
    }

    Promise.all([app.restored, settingsRegistry?.load(chatPlugin.id)])
      .then(([, settings]) => {
        if (!settings) {
          console.warn(
            'The SettingsRegistry is not loaded for the chat extension'
          );
          return;
        }
        loadSetting(settings);
        settings.changed.connect(loadSetting);
      })
      .catch(reason => {
        console.error(
          `Something went wrong when reading the settings.\n${reason}`
        );
      });

    let chatWidget: ReactWidget | null = null;
    try {
      chatWidget = buildChatSidebar({
        model: chatHandler,
        themeManager,
        rmRegistry,
        chatCommandRegistry
      });
      chatWidget.title.caption = 'Jupyterlite AI Chat';
    } catch (e) {
      chatWidget = buildErrorWidget(themeManager);
    }

    app.shell.add(chatWidget as ReactWidget, 'left', { rank: 2000 });

    console.log('Chat extension initialized');
  }
};

const completerPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:completer',
  autoStart: true,
  requires: [IAIProviderRegistry, ICompletionProviderManager],
  activate: (
    app: JupyterFrontEnd,
    providerRegistry: IAIProviderRegistry,
    manager: ICompletionProviderManager
  ): void => {
    const completer = new CompletionProvider({
      providerRegistry,
      requestCompletion: () => app.commands.execute('inline-completer:invoke')
    });
    manager.registerInlineProvider(completer);
  }
};

const providerRegistryPlugin: JupyterFrontEndPlugin<IAIProviderRegistry> = {
  id: '@jupyterlite/ai:provider-registry',
  autoStart: true,
  requires: [IFormRendererRegistry, ISettingRegistry],
  optional: [IRenderMimeRegistry, ISecretsManager],
  provides: IAIProviderRegistry,
  activate: (
    app: JupyterFrontEnd,
    editorRegistry: IFormRendererRegistry,
    settingRegistry: ISettingRegistry,
    rmRegistry?: IRenderMimeRegistry,
    secretsManager?: ISecretsManager
  ): IAIProviderRegistry => {
    const providerRegistry = new AIProviderRegistry();

    editorRegistry.addRenderer(
      '@jupyterlite/ai:provider-registry.AIprovider',
      aiSettingsRenderer({ providerRegistry, rmRegistry, secretsManager })
    );
    settingRegistry
      .load(providerRegistryPlugin.id)
      .then(settings => {
        const updateProvider = () => {
          // Update the settings to the AI providers.
          const providerSettings = (settings.get('AIprovider').composite ?? {
            provider: 'None'
          }) as ReadonlyPartialJSONObject;
          providerRegistry.setProvider(
            providerSettings.provider as string,
            providerSettings
          );
        };

        settings.changed.connect(() => updateProvider());
        updateProvider();
      })
      .catch(reason => {
        console.error(
          `Failed to load settings for ${providerRegistryPlugin.id}`,
          reason
        );
      });

    return providerRegistry;
  }
};

export default [
  providerRegistryPlugin,
  chatCommandRegistryPlugin,
  chatPlugin,
  completerPlugin,
  ...defaultProviderPlugins
];
