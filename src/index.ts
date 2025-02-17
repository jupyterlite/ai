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
import { IThemeManager, ReactWidget } from '@jupyterlab/apputils';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ChatHandler } from './chat-handler';
import { getSettings } from './llm-models';
import { AIProvider } from './provider';
import { renderSlashCommandOption } from './slash-commands';
import { IAIProvider } from './token';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IMagicProvider } from 'jupyterlab_magic_wand';

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

const magicProviderPlugin: JupyterFrontEndPlugin<IMagicProvider> = {
  id: '@jupyterlite/ai:magic-provider',
  autoStart: true,
  requires: [IAIProvider],
  provides: IMagicProvider,
  activate: (app: JupyterFrontEnd, aiProvider: IAIProvider): IMagicProvider => {
    console.log('@jupyterlite/ai magic provider plugin activated');
    const events = app.serviceManager.events;

    return {
      magic: async (magicContext: IMagicProvider.IMagicContext) => {
        const { codeInput, cellId, content } = magicContext;
        const trimmedPrompt = codeInput.trim();

        // TODO: taken from jupyterlab-magic-wand
        const PROMPT =
          'The input below came from a code cell in Jupyter. If the input does not look like code, but instead a prompt, write code based on the prompt. Then, update the code to make it more efficient, add code comments, and respond with only the code and comments. Do not format the response using backticks or code block delimiters, just give the code that will be inserted into the cell directly.';

        const messages = [
          new SystemMessage(PROMPT),
          new HumanMessage(trimmedPrompt)
        ];

        const response = await aiProvider.chatModel?.invoke(messages);
        if (!response) {
          return;
        }

        const source = response.content;

        events.emit({
          schema_id: 'https://events.jupyter.org/jupyter_ai/magic_button/v1',
          version: '1',
          data: {
            agent: 'Magic Button Agent',
            input: codeInput,
            // @ts-expect-error: TODO
            context: {
              cell_id: cellId,
              content
            },
            messages: [source],
            commands: [
              {
                name: 'update-cell-source',
                args: {
                  cell_id: cellId,
                  cell_type: 'code',
                  source: source
                }
              },
              {
                name: 'show-diff',
                args: {
                  cell_id: cellId,
                  original_source: codeInput
                  // TODO
                  // diff: {}
                }
              }
            ]
          }
        });
        // TODO:
        console.log('MAGIC PROVIDER');
        console.log(cellId, codeInput, content);
      }
    };
  }
};

export default [
  chatPlugin,
  aiProviderPlugin,
  autocompletionRegistryPlugin,
  magicProviderPlugin
];
