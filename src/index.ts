import {
  ActiveCellManager,
  AutocompletionRegistry,
  buildChatSidebar,
  buildErrorWidget,
  IActiveCellManager,
  IAutocompletionCommandsProps,
  IAutocompletionRegistry
} from '@jupyter/chat';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  ReactWidget,
  IThemeManager,
  ICommandPalette
} from '@jupyterlab/apputils';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IFormRendererRegistry } from '@jupyterlab/ui-components';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { ChatHandler } from './chat-handler';
import { AIProvider } from './provider';
import { aiSettingsRenderer } from './settings-panel';
import { renderSlashCommandOption } from './slash-commands';
import { IAIProvider } from './token';

const autocompletionRegistryPlugin: JupyterFrontEndPlugin<IAutocompletionRegistry> =
  {
    id: '@jupyterlite/ai:autocompletion-registry',
    description: 'Autocompletion registry',
    autoStart: true,
    provides: IAutocompletionRegistry,
    activate: () => {
      const autocompletionRegistry = new AutocompletionRegistry();
      const options = ['/clear'];
      const autocompletionCommands: IAutocompletionCommandsProps = {
        opener: '/',
        commands: options.map(option => {
          return {
            id: option.slice(1),
            label: option,
            description: 'Clear the chat window'
          };
        }),
        props: {
          renderOption: renderSlashCommandOption
        }
      };
      autocompletionRegistry.add('jupyterlite-ai', autocompletionCommands);
      return autocompletionRegistry;
    }
  };

const chatPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:chat',
  description: 'LLM chat extension',
  autoStart: true,
  requires: [IAIProvider, IRenderMimeRegistry, IAutocompletionRegistry],
  optional: [INotebookTracker, ISettingRegistry, IThemeManager],
  activate: async (
    app: JupyterFrontEnd,
    aiProvider: IAIProvider,
    rmRegistry: IRenderMimeRegistry,
    autocompletionRegistry: IAutocompletionRegistry,
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
      aiProvider: aiProvider,
      activeCellManager: activeCellManager
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
        autocompletionRegistry
      });
      chatWidget.title.caption = 'Jupyterlite AI Chat';
    } catch (e) {
      chatWidget = buildErrorWidget(themeManager);
    }

    app.shell.add(chatWidget as ReactWidget, 'left', { rank: 2000 });

    console.log('Chat extension initialized');
  }
};

const aiProviderPlugin: JupyterFrontEndPlugin<IAIProvider> = {
  id: '@jupyterlite/ai:ai-provider',
  autoStart: true,
  requires: [
    ICompletionProviderManager,
    IFormRendererRegistry,
    ISettingRegistry
  ],
  optional: [ICommandPalette],
  provides: IAIProvider,
  activate: (
    app: JupyterFrontEnd,
    manager: ICompletionProviderManager,
    editorRegistry: IFormRendererRegistry,
    settingRegistry: ISettingRegistry,
    palette?: ICommandPalette
  ): IAIProvider => {
    const aiProvider = new AIProvider({
      completionProviderManager: manager,
      requestCompletion: () => app.commands.execute('inline-completer:invoke')
    });

    editorRegistry.addRenderer(
      '@jupyterlite/ai:ai-provider.provider',
      aiSettingsRenderer
    );
    settingRegistry
      .load(aiProviderPlugin.id)
      .then(settings => {
        const updateProvider = () => {
          // Update the settings to the AI providers.
          const providerSettings = (settings.get('provider').composite ?? {
            provider: 'None'
          }) as ReadonlyPartialJSONObject;
          aiProvider.setModels(
            providerSettings.provider as string,
            providerSettings
          );
        };

        settings.changed.connect(() => updateProvider());
        updateProvider();
      })
      .catch(reason => {
        console.error(
          `Failed to load settings for ${aiProviderPlugin.id}`,
          reason
        );
      });

    return aiProvider;
  }
};

export default [chatPlugin, autocompletionRegistryPlugin, aiProviderPlugin];
