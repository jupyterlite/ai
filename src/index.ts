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
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';
import { ReactWidget, IThemeManager } from '@jupyterlab/apputils';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';
import { IFormRendererRegistry } from '@jupyterlab/ui-components';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ISecretsManager, SecretsManager } from 'jupyter-secrets-manager';

import { ChatHandler, welcomeMessage } from './chat-handler';
import { CompletionProvider } from './completion-provider';
import { defaultProviderPlugins } from './default-providers';
import { AIProviderRegistry } from './provider';
import { aiSettingsRenderer, textArea } from './settings';
import { IAIProviderRegistry, PLUGIN_IDS } from './tokens';
import { stopItem } from './components/stop-button';

const chatCommandRegistryPlugin: JupyterFrontEndPlugin<IChatCommandRegistry> = {
  id: PLUGIN_IDS.chatCommandRegistry,
  description: 'Autocompletion registry',
  autoStart: true,
  provides: IChatCommandRegistry,
  requires: [ITranslator],
  activate: (app: JupyterFrontEnd, translator: ITranslator) => {
    const trans = translator.load('jupyterlite_ai');
    const registry = new ChatCommandRegistry();
    registry.addProvider(new ChatHandler.ClearCommandProvider(trans));
    return registry;
  }
};

const chatPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_IDS.chat,
  description: 'LLM chat extension',
  autoStart: true,
  requires: [
    IAIProviderRegistry,
    IRenderMimeRegistry,
    IChatCommandRegistry,
    ITranslator
  ],
  optional: [
    INotebookTracker,
    ISettingRegistry,
    IThemeManager,
    ILayoutRestorer
  ],
  activate: async (
    app: JupyterFrontEnd,
    providerRegistry: IAIProviderRegistry,
    rmRegistry: IRenderMimeRegistry,
    chatCommandRegistry: IChatCommandRegistry,
    translator: ITranslator,
    notebookTracker: INotebookTracker | null,
    settingsRegistry: ISettingRegistry | null,
    themeManager: IThemeManager | null,
    restorer: ILayoutRestorer | null
  ) => {
    const trans = translator.load('jupyterlite_ai');
    let activeCellManager: IActiveCellManager | null = null;
    if (notebookTracker) {
      activeCellManager = new ActiveCellManager({
        tracker: notebookTracker,
        shell: app.shell
      });
    }

    const chatHandler = new ChatHandler({
      providerRegistry,
      activeCellManager,
      translator: trans
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
            trans.__(
              'The SettingsRegistry is not loaded for the chat extension'
            )
          );
          return;
        }
        loadSetting(settings);
        settings.changed.connect(loadSetting);
      })
      .catch(reason => {
        console.error(
          trans.__(
            'Something went wrong when reading the settings.\n%1',
            reason
          )
        );
      });

    let chatWidget: ReactWidget | null = null;

    const inputToolbarRegistry = InputToolbarRegistry.defaultToolbarRegistry();
    const stopButton = stopItem(() => chatHandler.stopStreaming(), trans);
    inputToolbarRegistry.addItem('stop', stopButton);

    chatHandler.writersChanged.connect((_, writers) => {
      if (
        writers.filter(
          writer => writer.user.username === chatHandler.personaName
        ).length
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
        inputToolbarRegistry,
        welcomeMessage: welcomeMessage(providerRegistry.providers, trans)
      });
    } catch (e) {
      chatWidget = buildErrorWidget(themeManager);
    }

    chatWidget.title.caption = trans.__('Jupyterlite AI Chat');
    chatWidget.id = '@jupyterlite/ai:chat-widget';

    app.shell.add(chatWidget as ReactWidget, 'left', { rank: 2000 });

    if (restorer) {
      restorer.add(chatWidget, chatWidget.id);
    }
  }
};

const completerPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_IDS.completer,
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

const providerRegistryPlugin: JupyterFrontEndPlugin<IAIProviderRegistry> =
  SecretsManager.sign(PLUGIN_IDS.providerRegistry, token => ({
    id: PLUGIN_IDS.providerRegistry,
    autoStart: true,
    requires: [IFormRendererRegistry, ISettingRegistry, ITranslator],
    optional: [IRenderMimeRegistry, ISecretsManager],
    provides: IAIProviderRegistry,
    activate: (
      app: JupyterFrontEnd,
      editorRegistry: IFormRendererRegistry,
      settingRegistry: ISettingRegistry,
      translator: ITranslator,
      rmRegistry?: IRenderMimeRegistry,
      secretsManager?: ISecretsManager
    ): IAIProviderRegistry => {
      const trans = translator.load('jupyterlite_ai');
      const providerRegistry = new AIProviderRegistry({
        token,
        secretsManager
      });

      editorRegistry.addRenderer(
        `${PLUGIN_IDS.providerRegistry}.AIproviders`,
        aiSettingsRenderer({
          providerRegistry,
          secretsToken: token,
          rmRegistry,
          secretsManager,
          translator
        })
      );

      settingRegistry
        .load(providerRegistryPlugin.id)
        .then(settings => {
          if (!secretsManager) {
            delete settings.schema.properties?.['UseSecretsManager'];
          }
          const updateProvider = () => {
            // Get the Ai provider settings.
            const providerSettings = settings.get('AIproviders')
              .composite as ReadonlyPartialJSONObject;

            // Update completer provider.
            if (Object.keys(providerSettings).includes('completer')) {
              providerRegistry.setCompleterProvider(
                providerSettings['completer'] as ReadonlyPartialJSONObject
              );
            } else {
              providerRegistry.setCompleterProvider({});
            }

            // Update chat provider.
            if (Object.keys(providerSettings).includes('chat')) {
              providerRegistry.setChatProvider(
                providerSettings['chat'] as ReadonlyPartialJSONObject
              );
            } else {
              providerRegistry.setChatProvider({});
            }
          };

          settings.changed.connect(() => updateProvider());
          updateProvider();
        })
        .catch(reason => {
          console.error(
            trans.__(
              'Failed to load settings for %1',
              providerRegistryPlugin.id
            ),
            reason
          );
        });

      return providerRegistry;
    }
  }));

const systemPromptsPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_IDS.systemPrompts,
  autoStart: true,
  requires: [IAIProviderRegistry, ISettingRegistry, ITranslator],
  optional: [IFormRendererRegistry],
  activate: (
    app: JupyterFrontEnd,
    providerRegistry: IAIProviderRegistry,
    settingsRegistry: ISettingRegistry,
    translator: ITranslator,
    editorRegistry: IFormRendererRegistry | null
  ): void => {
    const trans = translator.load('jupyterlite_ai');
    // Set textarea renderer for the prompt setting.
    editorRegistry?.addRenderer(
      `${PLUGIN_IDS.systemPrompts}.chatSystemPrompt`,
      textArea
    );
    editorRegistry?.addRenderer(
      `${PLUGIN_IDS.systemPrompts}.completionSystemPrompt`,
      textArea
    );

    /**
     * Update the prompts in the provider registry.
     */
    function loadSetting(setting: ISettingRegistry.ISettings): void {
      providerRegistry.chatSystemPrompt = setting.get('chatSystemPrompt')
        .composite as string;
      providerRegistry.completerSystemPrompt = setting.get(
        'completionSystemPrompt'
      ).composite as string;
    }

    Promise.all([
      app.restored,
      settingsRegistry?.load(PLUGIN_IDS.systemPrompts)
    ])
      .then(([, settings]) => {
        if (!settings) {
          console.warn(
            trans.__(
              'The SettingsRegistry is not loaded for the chat extension'
            )
          );
          return;
        }
        loadSetting(settings);
        settings.changed.connect(loadSetting);
      })
      .catch(reason => {
        console.error(
          trans.__(
            'Something went wrong when reading the settings.\n%1',
            reason
          )
        );
      });
  }
};

export default [
  providerRegistryPlugin,
  chatCommandRegistryPlugin,
  chatPlugin,
  completerPlugin,
  systemPromptsPlugin,
  ...defaultProviderPlugins
];

export { IAIProviderRegistry } from './tokens';
export * from './base-completer';
