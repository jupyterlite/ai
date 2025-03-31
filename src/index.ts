import {
  ActiveCellManager,
  buildChatSidebar,
  buildErrorWidget,
  ChatCommandRegistry,
  IActiveCellManager,
  IChatCommandRegistry,
  InputToolbarRegistry
} from '@jupyter/chat';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ReactWidget, IThemeManager } from '@jupyterlab/apputils';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import {
  ISettingConnector,
  ISettingRegistry
} from '@jupyterlab/settingregistry';
import { IFormRendererRegistry } from '@jupyterlab/ui-components';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ISecretsManager } from 'jupyter-secrets-manager';

import { ChatHandler } from './chat-handler';
import { CompletionProvider } from './completion-provider';
import { defaultProviderPlugins } from './default-providers';
import { AIProviderRegistry } from './provider';
import { aiSettingsRenderer, SettingConnector } from './settings';
import { IAIProviderRegistry } from './tokens';
import { stopItem } from './components/stop-button';

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

    const inputToolbarRegistry = InputToolbarRegistry.defaultToolbarRegistry();
    const stopButton = stopItem(() => chatHandler.stopStreaming());
    inputToolbarRegistry.addItem('stop', stopButton);

    chatHandler.writersChanged.connect((_, users) => {
      if (
        users.filter(user => user.username === chatHandler.personaName).length
      ) {
        inputToolbarRegistry.hide('send');
        inputToolbarRegistry.show('stop');
      } else {
        inputToolbarRegistry.hide('stop');
        inputToolbarRegistry.show('send');
      }
    });

    try {
      chatWidget = buildChatSidebar({
        model: chatHandler,
        themeManager,
        rmRegistry,
        chatCommandRegistry,
        inputToolbarRegistry
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
  optional: [IRenderMimeRegistry, ISecretsManager, ISettingConnector],
  provides: IAIProviderRegistry,
  activate: (
    app: JupyterFrontEnd,
    editorRegistry: IFormRendererRegistry,
    settingRegistry: ISettingRegistry,
    rmRegistry?: IRenderMimeRegistry,
    secretsManager?: ISecretsManager,
    settingConnector?: ISettingConnector
  ): IAIProviderRegistry => {
    const providerRegistry = new AIProviderRegistry({ secretsManager });

    editorRegistry.addRenderer(
      '@jupyterlite/ai:provider-registry.AIprovider',
      aiSettingsRenderer({
        providerRegistry,
        rmRegistry,
        secretsManager,
        settingConnector
      })
    );

    settingRegistry
      .load(providerRegistryPlugin.id)
      .then(settings => {
        const updateProvider = () => {
          // Update the settings to the AI providers.
          const providerSettings = (settings.get('AIprovider').composite ?? {
            provider: 'None'
          }) as ReadonlyPartialJSONObject;
          providerRegistry.setProvider({
            name: providerSettings.provider as string,
            settings: providerSettings
          });
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

/**
 * Provides the settings connector as a separate plugin to allow for alternative
 * implementations that may want to fetch settings from a different source or
 * endpoint.
 */
const settingsConnector: JupyterFrontEndPlugin<ISettingConnector> = {
  id: '@jupyterlite/ai:settings-connector',
  description: 'Provides a settings connector which does not save passwords.',
  autoStart: true,
  provides: ISettingConnector,
  activate: (app: JupyterFrontEnd) =>
    new SettingConnector(app.serviceManager.settings)
};

export default [
  providerRegistryPlugin,
  chatCommandRegistryPlugin,
  chatPlugin,
  completerPlugin,
  settingsConnector,
  ...defaultProviderPlugins
];
