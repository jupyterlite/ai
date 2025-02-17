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
import { ReactWidget, IThemeManager, Notification } from '@jupyterlab/apputils';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ChatHandler } from './chat-handler';
import { getSettings } from './llm-models';
import { AIProvider } from './provider';
import { renderSlashCommandOption } from './slash-commands';
import { IAIProvider } from './token';
import { ChatWebLLM } from '@langchain/community/chat_models/webllm';

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
  requires: [ICompletionProviderManager, ISettingRegistry],
  provides: IAIProvider,
  activate: (
    app: JupyterFrontEnd,
    manager: ICompletionProviderManager,
    settingRegistry: ISettingRegistry
  ): IAIProvider => {
    const aiProvider = new AIProvider({
      completionProviderManager: manager,
      requestCompletion: () => app.commands.execute('inline-completer:invoke')
    });

    let currentProvider = 'None';
    settingRegistry
      .load(aiProviderPlugin.id)
      .then(settings => {
        const updateProvider = () => {
          const provider = settings.get('provider').composite as string;
          if (provider !== currentProvider) {
            // Update the settings panel.
            currentProvider = provider;
            const settingsProperties = settings.schema.properties;
            if (settingsProperties) {
              const schemaKeys = Object.keys(settingsProperties);
              schemaKeys.forEach(key => {
                if (key !== 'provider') {
                  delete settings.schema.properties?.[key];
                }
              });
              const properties = getSettings(provider);
              if (properties === null) {
                return;
              }
              Object.entries(properties).forEach(([name, value], index) => {
                settingsProperties[name] = value as ISettingRegistry.IProperty;
              });
            }
          }

          // Update the settings to the AI providers.
          aiProvider.setModels(provider, settings.composite);
          const { chatModel, chatError } = aiProvider;
          if (chatModel === null) {
            Notification.emit(chatError, 'error', {
              autoClose: 2000
            });
            return;
          }

          // TODO: implement a proper way to handle models that may need to be initialized before being used.
          // Mostly applies to WebLLM and ChromeAI as they may need to download the model in the browser first.
          if (provider === 'WebLLM') {
            const model = aiProvider.chatModel as ChatWebLLM;
            if (model === null || !model.model) {
              return;
            }
            // create a notification
            const notification = Notification.emit(
              'Loading model...',
              'in-progress',
              {
                autoClose: false,
                progress: 0
              }
            );
            try {
              void model.initialize(report => {
                const { progress, text } = report;
                if (progress === 1) {
                  Notification.update({
                    id: notification,
                    progress: 1,
                    message: `Model ${model.model} loaded successfully`,
                    type: 'success',
                    autoClose: 2000
                  });
                  return;
                }
                Notification.update({
                  id: notification,
                  progress: progress / 1,
                  message: text,
                  type: 'in-progress'
                });
              });
            } catch (err) {
              Notification.update({
                id: notification,
                progress: 1,
                message: `Error loading model ${model.model}`,
                type: 'error',
                autoClose: 2000
              });
            }
          }
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
