import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  ActiveCellManager,
  AttachmentOpenerRegistry,
  chatIcon,
  ChatCommandRegistry,
  ChatWidget,
  IAttachmentOpenerRegistry,
  IChatCommandRegistry,
  IChatTracker,
  IInputToolbarRegistryFactory,
  InputToolbarRegistry,
  MultiChatPanel,
  IChatModel
} from '@jupyter/chat';

import {
  ICommandPalette,
  IThemeManager,
  showDialog,
  showErrorMessage,
  WidgetTracker
} from '@jupyterlab/apputils';

import { ICompletionProviderManager } from '@jupyterlab/completer';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { FileDialog } from '@jupyterlab/filebrowser';

import { INotebookTracker } from '@jupyterlab/notebook';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStatusBar } from '@jupyterlab/statusbar';

import { PathExt } from '@jupyterlab/coreutils';

import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';

import {
  fileUploadIcon,
  saveIcon,
  settingsIcon,
  Toolbar,
  ToolbarButton
} from '@jupyterlab/ui-components';

import { PromiseDelegate, UUID } from '@lumino/coreutils';

import { DisposableSet } from '@lumino/disposable';

import { CommandRegistry } from '@lumino/commands';

import { IComponentsRendererFactory } from 'jupyter-chat-components';

import { ISecretsManager, SecretsManager } from 'jupyter-secrets-manager';

import { AgentManagerFactory } from './agent';

import { AIChatModel } from './chat-model';

import { RenderedMessageOutputAreaCompat } from './rendered-message-outputarea';

import { ClearCommandProvider } from './chat-commands/clear';

import { SkillsCommandProvider } from './chat-commands/skills';

import { ProviderRegistry } from './providers/provider-registry';

import { SaveComponentWidget } from './components/save-button';

import { ChatModelHandler } from './chat-model-handler';

import {
  CommandIds,
  IAgentManagerFactory,
  type IAISecretsAccess,
  IAISettingsModel,
  IChatModelHandler,
  IDiffManager,
  type IProviderConfig,
  IProviderRegistry,
  IToolRegistry,
  ISkillRegistry,
  SECRETS_NAMESPACE
} from './tokens';

import {
  anthropicProvider,
  googleProvider,
  mistralProvider,
  openaiProvider,
  genericProvider
} from './providers/built-in-providers';

import { AICompletionProvider } from './completion';

import {
  clearItem,
  createModelSelectItem,
  createToolSelectItem,
  stopItem,
  CompletionStatusWidget,
  UsageWidget
} from './components';

import { AISettingsModel } from './models/settings-model';

import { loadSkillsFromPaths, SkillRegistry } from './skills';

import { DiffManager } from './diff-manager';

import { ToolRegistry } from './tools/tool-registry';

import {
  createDiscoverCommandsTool,
  createExecuteCommandTool
} from './tools/commands';

import { createDiscoverSkillsTool, createLoadSkillTool } from './tools/skills';

import { createBrowserFetchTool } from './tools/web';

import { AISettingsWidget } from './widgets/ai-settings';

import { MainAreaChat } from './widgets/main-area-chat';

namespace Private {
  let aiSecretsToken: symbol | null = null;

  export function setAISecretsToken(token: symbol | null): void {
    aiSecretsToken = token;
  }

  export function createAISecretsAccess(
    secretsManager?: ISecretsManager
  ): IAISecretsAccess {
    return {
      get isAvailable() {
        return !!(aiSecretsToken && secretsManager);
      },
      async get(id: string): Promise<string | undefined> {
        if (!aiSecretsToken || !secretsManager) {
          return;
        }
        const secret = await secretsManager.get(
          aiSecretsToken,
          SECRETS_NAMESPACE,
          id
        );
        return secret?.value;
      },
      async set(id: string, value: string): Promise<void> {
        if (!aiSecretsToken || !secretsManager) {
          return;
        }
        await secretsManager.set(aiSecretsToken, SECRETS_NAMESPACE, id, {
          namespace: SECRETS_NAMESPACE,
          id,
          value
        });
      },
      async attach(
        id: string,
        input: HTMLInputElement,
        callback?: (value: string) => void
      ): Promise<void> {
        if (!aiSecretsToken || !secretsManager) {
          return;
        }
        await secretsManager.attach(
          aiSecretsToken,
          SECRETS_NAMESPACE,
          id,
          input,
          callback
        );
      }
    };
  }
}

/**
 * Provider registry plugin
 */
const providerRegistryPlugin: JupyterFrontEndPlugin<IProviderRegistry> = {
  id: '@jupyterlite/ai:provider-registry',
  description: 'AI provider registry',
  autoStart: true,
  provides: IProviderRegistry,
  activate: () => {
    return new ProviderRegistry();
  }
};

/**
 * Anthropic provider plugin
 */
const anthropicProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:anthropic-provider',
  description: 'Register Anthropic provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(anthropicProvider);
  }
};

/**
 * Google provider plugin
 */
const googleProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:google-provider',
  description: 'Register Google Generative AI provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(googleProvider);
  }
};

/**
 * Mistral provider plugin
 */
const mistralProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:mistral-provider',
  description: 'Register Mistral provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(mistralProvider);
  }
};

/**
 * OpenAI provider plugin
 */
const openaiProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:openai-provider',
  description: 'Register OpenAI provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(openaiProvider);
  }
};

/**
 * Generic provider plugin
 */
const genericProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:generic-provider',
  description: 'Register Generic OpenAI-compatible provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(genericProvider);
  }
};

/**
 * Chat command registry plugin.
 */
const chatCommandRegistryPlugin: JupyterFrontEndPlugin<IChatCommandRegistry> = {
  id: '@jupyterlite/ai:chat-command-registry',
  description: 'Provide the chat command registry for JupyterLite AI.',
  autoStart: true,
  provides: IChatCommandRegistry,
  activate: () => {
    return new ChatCommandRegistry();
  }
};

/**
 * Clear chat command plugin.
 */
const clearCommandPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:clear-command',
  description: 'Register the /clear chat command.',
  autoStart: true,
  requires: [IChatCommandRegistry],
  activate: (app, registry: IChatCommandRegistry) => {
    registry.addProvider(new ClearCommandProvider());
  }
};

/**
 * Skills chat command plugin.
 */
const skillsCommandPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:skills-command',
  description: 'Register the /skills chat command.',
  autoStart: true,
  requires: [IChatCommandRegistry, ISkillRegistry],
  activate: (
    app,
    registry: IChatCommandRegistry,
    skillRegistry: ISkillRegistry
  ) => {
    registry.addProvider(
      new SkillsCommandProvider({
        skillRegistry,
        commands: app.commands
      })
    );
  }
};

/**
 * The chat model handler.
 */
const chatModelHandler: JupyterFrontEndPlugin<IChatModelHandler> = {
  id: '@jupyterlite/ai:chat-model-handler',
  description: 'A handler to create current chat model',
  autoStart: true,
  requires: [
    IAISettingsModel,
    IAgentManagerFactory,
    IDocumentManager,
    IRenderMimeRegistry
  ],
  optional: [IProviderRegistry, IToolRegistry, ITranslator],
  provides: IChatModelHandler,
  activate: async (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    agentManagerFactory: IAgentManagerFactory,
    docManager: IDocumentManager,
    rmRegistry: IRenderMimeRegistry,
    providerRegistry?: IProviderRegistry,
    toolRegistry?: IToolRegistry
  ): Promise<IChatModelHandler> => {
    await app.serviceManager.ready;

    return new ChatModelHandler({
      settingsModel,
      agentManagerFactory,
      docManager,
      rmRegistry,
      providerRegistry,
      toolRegistry,
      contentsManager: app.serviceManager.contents
    });
  }
};

/**
 * The active cell manager plugin, to allow copying code from chat to notebook.
 */
const activeCellManager: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:activeCellManager',
  description: 'Add the active cell manager to the model handler',
  autoStart: true,
  requires: [IChatModelHandler, INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    modelHandler: IChatModelHandler,
    notebookTracker: INotebookTracker
  ) => {
    const activeCellManager = new ActiveCellManager({
      tracker: notebookTracker,
      shell: app.shell
    });
    modelHandler.activeCellManager = activeCellManager;
  }
};

/**
 * Initialization data for the extension.
 */
const plugin: JupyterFrontEndPlugin<IChatTracker> = {
  id: '@jupyterlite/ai:plugin',
  description: 'AI in JupyterLab',
  autoStart: true,
  provides: IChatTracker,
  requires: [
    IRenderMimeRegistry,
    IInputToolbarRegistryFactory,
    IChatModelHandler,
    IAISettingsModel,
    IChatCommandRegistry
  ],
  optional: [
    IThemeManager,
    ILayoutRestorer,
    ILabShell,
    ITranslator,
    IComponentsRendererFactory,
    ICommandPalette,
    IDocumentManager
  ],
  activate: (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
    inputToolbarFactory: IInputToolbarRegistryFactory,
    modelHandler: IChatModelHandler,
    settingsModel: IAISettingsModel,
    chatCommandRegistry: IChatCommandRegistry,
    themeManager?: IThemeManager,
    restorer?: ILayoutRestorer,
    labShell?: ILabShell,
    translator?: ITranslator,
    chatComponentsFactory?: IComponentsRendererFactory,
    palette?: ICommandPalette,
    documentManager?: IDocumentManager
  ): IChatTracker => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');

    // Create attachment opener registry to handle file attachments
    const attachmentOpenerRegistry = new AttachmentOpenerRegistry();
    attachmentOpenerRegistry.set('file', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    attachmentOpenerRegistry.set('notebook', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    const openSettings = () => {
      if (app.commands.hasCommand(CommandIds.openSettings)) {
        void app.commands.execute(CommandIds.openSettings);
      }
    };

    // Creating the tracker for the chat widgets
    const namespace = 'ai-chat';
    const tracker = new WidgetTracker<MainAreaChat | ChatWidget>({ namespace });

    // Create chat panel with drag/drop functionality
    const chatPanel = new MultiChatPanel({
      rmRegistry,
      themeManager: themeManager ?? null,
      inputToolbarFactory,
      attachmentOpenerRegistry,
      chatCommandRegistry,
      createModel: async (provider?: string) => {
        if (!provider) {
          provider = settingsModel.getDefaultProvider()?.id;
          if (!provider) {
            showErrorMessage('Error creating chat', 'Please set up a provider');
            openSettings();
            return {};
          }
        }
        let name = settingsModel.getProvider(provider)?.name ?? UUID.uuid4();
        const modelName = name;
        const existingName = new Set(chatPanel.getLoadedModelNames());
        tracker.forEach(widget => existingName.add(widget.model.name));
        let i = 1;
        while (existingName.has(name)) {
          name = `${modelName}-${i}`;
          i += 1;
        }
        const model = modelHandler.createModel({
          name,
          activeProvider: provider
        });
        return { model };
      },
      getChatNames: async () => {
        const names: { [name: string]: string } = {};
        settingsModel.config.providers.forEach(provider => {
          names[provider.name] = provider.id;
        });
        return names;
      },
      renameChat: true,
      openInMain: (name: string) =>
        app.commands.execute(CommandIds.moveChat, {
          area: 'main',
          name
        }) as Promise<boolean>
    });

    chatPanel.id = '@jupyterlite/ai:chat-panel';
    chatPanel.title.icon = chatIcon;
    chatPanel.title.caption = trans.__('Chat with AI assistant');

    chatPanel.toolbar.addItem('spacer', Toolbar.createSpacerItem());

    const addSettingsButton = () => {
      chatPanel.toolbar.addItem(
        'settings',
        new ToolbarButton({
          icon: settingsIcon,
          onClick: openSettings,
          tooltip: trans.__('Open AI Settings')
        })
      );
    };

    if (app.commands.hasCommand(CommandIds.openSettings)) {
      addSettingsButton();
    } else {
      const disconnectSettingsButtonListener = () => {
        app.commands.commandChanged.disconnect(onCommandChanged);
        chatPanel.disposed.disconnect(disconnectSettingsButtonListener);
      };

      const onCommandChanged = (
        _: CommandRegistry,
        args: CommandRegistry.ICommandChangedArgs
      ) => {
        if (args.id === CommandIds.openSettings && args.type === 'added') {
          disconnectSettingsButtonListener();
          addSettingsButton();
        }
      };

      app.commands.commandChanged.connect(onCommandChanged);
      chatPanel.disposed.connect(disconnectSettingsButtonListener);
    }

    let usageWidget: UsageWidget | null = null;
    chatPanel.chatOpened.connect((_, widget) => {
      const model = widget.model as AIChatModel;

      // Add the widget to the tracker.
      tracker.add(widget);

      function saveTracker() {
        tracker.save(widget);
      }

      function updateToolbarTitleOverlay() {
        const titleNode = chatPanel.current?.toolbar.node
          .getElementsByClassName('jp-chat-sidepanel-widget-title')
          .item(0);
        if (titleNode) {
          titleNode.setAttribute('title', model.title ?? model.name);
        }
      }

      model.titleChanged.connect(updateToolbarTitleOverlay);
      updateToolbarTitleOverlay();

      // Update the tracker if the model name changed.
      model.nameChanged.connect(saveTracker);

      // Update the tracker if the active provider changed.
      model.agentManager.activeProviderChanged.connect(saveTracker);

      // Update the token usage widget.
      usageWidget?.dispose();

      usageWidget = new UsageWidget({
        tokenUsageChanged: model.tokenUsageChanged,
        settingsModel,
        initialTokenUsage: model.agentManager.tokenUsage,
        translator: trans
      });
      chatPanel.current?.toolbar.insertBefore('markRead', 'usage', usageWidget);

      if (model.saveAvailable) {
        const saveChatButton = new SaveComponentWidget({
          model,
          translator: trans
        });

        chatPanel.current?.toolbar.insertAfter(
          'markRead',
          'saveChat',
          saveChatButton
        );
      }

      // Listen for writers change to display the stop button.
      function writersChanged(_: IChatModel, writers: IChatModel.IWriter[]) {
        // Check if AI is currently writing (streaming)
        const aiWriting = writers.some(
          writer => writer.user.username === 'ai-assistant'
        );

        if (aiWriting) {
          widget.inputToolbarRegistry?.hide('send');
          widget.inputToolbarRegistry?.show('stop');
        } else {
          widget.inputToolbarRegistry?.hide('stop');
          widget.inputToolbarRegistry?.show('send');
        }
      }

      model.writersChanged?.connect(writersChanged);

      // Temporary compat: keep output-area CSS context for MIME renderers
      // until jupyter-chat provides it natively.
      const outputAreaCompat = new RenderedMessageOutputAreaCompat({
        chatPanel: widget
      });

      widget.disposed.connect(() => {
        model.titleChanged.disconnect(updateToolbarTitleOverlay);
        model.nameChanged.disconnect(saveTracker);
        model.agentManager.activeProviderChanged.disconnect(saveTracker);
        model.writersChanged?.disconnect(writersChanged);

        // Dispose of the approval buttons widget when the chat is disposed.
        outputAreaCompat.dispose();
      });
    });

    /**
     * Update the available chat list when settings config changed.
     */
    settingsModel.stateChanged.connect(() => {
      chatPanel.updateChatList();
    });

    app.shell.add(chatPanel, 'left', { rank: 1000 });

    if (restorer) {
      restorer.add(chatPanel, chatPanel.id);
      void restorer.restore(tracker, {
        command: CommandIds.openChat,
        args: widget => ({
          name: widget.model.name,
          area: widget instanceof MainAreaChat ? 'main' : 'side',
          provider: (widget.model as AIChatModel).agentManager.activeProvider
        }),
        name: widget => {
          const area = widget instanceof MainAreaChat ? 'main' : 'side';
          return `${area}:${widget.model.name}`;
        }
      });
    }

    // Create a chat with default provider at startup.
    app.restored.then(() => {
      if (!tracker.size && settingsModel.config.defaultProvider) {
        app.commands.execute(CommandIds.openChat);
      }
    });

    registerCommands(
      app,
      rmRegistry,
      chatPanel,
      attachmentOpenerRegistry,
      inputToolbarFactory,
      settingsModel,
      chatCommandRegistry,
      tracker,
      modelHandler,
      trans,
      themeManager,
      labShell,
      palette,
      documentManager
    );

    /**
     * The callback for grouped tool calls permission decisions.
     */
    function toolCallPermissionDecision(
      sessionId: string,
      toolCallId: string,
      optionId: string
    ) {
      const model = tracker.find(chat => chat.model.name === sessionId)
        ?.model as AIChatModel;
      if (!model) {
        return;
      }

      const isApproved = optionId === 'approve';
      isApproved
        ? model.agentManager.approveToolCall(toolCallId)
        : model.agentManager.rejectToolCall(toolCallId);
    }

    if (chatComponentsFactory) {
      chatComponentsFactory.toolCallPermissionDecision =
        toolCallPermissionDecision;
    }

    return tracker;
  }
};

function registerCommands(
  app: JupyterFrontEnd,
  rmRegistry: IRenderMimeRegistry,
  chatPanel: MultiChatPanel,
  attachmentOpenerRegistry: IAttachmentOpenerRegistry,
  inputToolbarFactory: IInputToolbarRegistryFactory,
  settingsModel: IAISettingsModel,
  chatCommandRegistry: IChatCommandRegistry,
  tracker: WidgetTracker<MainAreaChat | ChatWidget>,
  modelRegistry: IChatModelHandler,
  trans: TranslationBundle,
  themeManager?: IThemeManager,
  labShell?: ILabShell,
  palette?: ICommandPalette,
  documentManager?: IDocumentManager
) {
  const { commands } = app;

  if (labShell) {
    commands.addCommand(CommandIds.reposition, {
      label: trans.__('Reposition Widget'),
      execute: (args: any) => {
        const { widgetId, area, mode } = args;
        const widget = widgetId
          ? Array.from(labShell.widgets('main')).find(w => w.id === widgetId) ||
            labShell.currentWidget
          : labShell.currentWidget;

        if (!widget) {
          return;
        }

        if (area && area !== 'main') {
          // Move to different area
          labShell.move(widget, area);
          labShell.activateById(widget.id);
        } else if (mode) {
          // Reposition within main area using split mode
          labShell.add(widget, 'main', { mode, activate: true });
        }
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {
            widgetId: {
              type: 'string',
              description: trans.__(
                'The widget ID to reposition in the application shell'
              )
            },
            area: {
              type: 'string',
              description: trans.__(
                'The name of the area to reposition the widget to'
              )
            },
            mode: {
              type: 'string',
              enum: ['split-left', 'split-right', 'split-top', 'split-bottom'],
              description: trans.__(
                'The mode to use when repositioning the widget'
              )
            }
          }
        }
      }
    });

    const openInMain = (model: AIChatModel): MainAreaChat => {
      const inputToolbarRegistry = inputToolbarFactory.create();
      const content = new ChatWidget({
        model,
        rmRegistry,
        themeManager: themeManager ?? null,
        inputToolbarRegistry,
        attachmentOpenerRegistry,
        chatCommandRegistry
      });
      const widget = new MainAreaChat({
        content,
        commands,
        settingsModel,
        trans
      });
      app.shell.add(widget, 'main');

      // Add the widget to the tracker.
      tracker.add(widget);

      function saveTracker() {
        tracker.save(widget);
      }

      // Update the tracker if the model name changed.
      model.nameChanged.connect(saveTracker);
      // Update the tracker if the active provider changed.
      model.agentManager.activeProviderChanged.connect(saveTracker);

      widget.disposed.connect(() => {
        model.nameChanged.disconnect(saveTracker);
        model.agentManager.activeProviderChanged.disconnect(saveTracker);
      });

      return widget;
    };

    const focusOnChat = (
      area: 'main' | 'side',
      widget?: ChatWidget | MainAreaChat
    ) => {
      if (area === 'main' && widget) {
        app.shell.activateById(widget.id);
      } else {
        app.shell.activateById(chatPanel.id);
      }
    };

    const applyInputArgs = (model: IChatModel, args: any) => {
      const input = typeof args.input === 'string' ? args.input : undefined;
      const autoSend = args.autoSend === true;
      const shouldFocus = args.focus !== false;

      if (input !== undefined) {
        model.input.value = input;
      }
      if (autoSend && input !== undefined) {
        model.input.send(model.input.value);
      }
      if (shouldFocus) {
        model.input.focus();
      }
    };

    const findChatWidget = (
      name?: string,
      provider?: string
    ): ChatWidget | MainAreaChat | undefined => {
      if (!name && !provider) {
        return;
      }
      return tracker.find(widget => {
        const model = widget.model as AIChatModel;
        return (
          (!name || widget.model.name === name) &&
          (!provider || model.agentManager.activeProvider === provider)
        );
      });
    };

    const disposeSideChatModel = (model: IChatModel): boolean => {
      const loadedName = chatPanel
        .getLoadedModelNames()
        .find(name => chatPanel.getLoadedModel(name) === model);

      if (!loadedName) {
        return false;
      }

      chatPanel.disposeLoadedModel(loadedName);
      return true;
    };

    commands.addCommand(CommandIds.openChat, {
      label: trans.__('Open a chat'),
      execute: async (args): Promise<boolean> => {
        const area = (args.area as string) === 'main' ? 'main' : 'side';
        const provider = (args.provider as string) ?? undefined;
        let name = (args.name as string) ?? undefined;

        let providerConfig: IProviderConfig | undefined = undefined;
        if (provider) {
          providerConfig = settingsModel.getProvider(provider);
        } else {
          providerConfig = settingsModel.getDefaultProvider();
        }

        // Do not open the chat if the provider in args does not exists in settings or
        // if there is no default provider.
        if (!providerConfig) {
          return false;
        }

        if (!name) {
          name = providerConfig.name;
        }

        const model = modelRegistry.createModel({
          name,
          activeProvider: provider
        });
        if (!model) {
          return false;
        }

        const shouldFocus = args.focus === true;
        let widget: ChatWidget | MainAreaChat | undefined;
        if (area === 'main') {
          widget = openInMain(model);
        } else {
          widget = chatPanel.open({ model });
        }
        if (shouldFocus) {
          focusOnChat(area, widget);
        }
        applyInputArgs(model, { ...args, focus: shouldFocus });

        return true;
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {
            area: {
              type: 'string',
              enum: ['main', 'side'],
              description: trans.__('The name of the area to open the chat to')
            },
            name: {
              type: 'string',
              description: trans.__('The name of the chat')
            },
            provider: {
              type: 'string',
              description: trans.__('The provider/model to use with this chat')
            },
            input: {
              type: 'string',
              description: trans.__('The input text to prefill in the chat')
            },
            focus: {
              type: 'boolean',
              description: trans.__(
                'Whether to focus the chat input after opening it'
              )
            },
            autoSend: {
              type: 'boolean',
              description: trans.__(
                'Whether to auto-send the provided input after opening the chat'
              )
            }
          }
        }
      }
    });

    commands.addCommand(CommandIds.openOrRevealChat, {
      label: trans.__('Open or reveal the chat panel'),
      execute: async (args): Promise<boolean> => {
        const area = (args.area as string) === 'main' ? 'main' : 'side';
        const provider = (args.provider as string) ?? undefined;
        const name = (args.name as string) ?? undefined;
        const shouldFocus = args.focus === true;

        let existingWidget = findChatWidget(name, provider);
        if (!existingWidget && !name) {
          const providerConfig = provider
            ? settingsModel.getProvider(provider)
            : settingsModel.getDefaultProvider();
          existingWidget = findChatWidget(undefined, providerConfig?.id);
        }

        // If the side chat model is loaded but not currently displayed, reveal it first.
        if (!existingWidget && name) {
          const loadedModel = chatPanel.getLoadedModel(name);
          if (loadedModel) {
            existingWidget = chatPanel.open({ model: loadedModel });
          }
        }

        if (!existingWidget) {
          return commands.execute(CommandIds.openChat, {
            ...args,
            focus: shouldFocus
          }) as Promise<boolean>;
        }

        const currentArea =
          existingWidget instanceof MainAreaChat ? 'main' : 'side';
        if (currentArea !== area) {
          const targetName = existingWidget.model.name;
          const moved = (await commands.execute(CommandIds.moveChat, {
            name: targetName,
            area
          })) as boolean;
          if (!moved) {
            return false;
          }

          const movedWidget = findChatWidget(targetName);
          if (!movedWidget) {
            return false;
          }

          if (area === 'side') {
            chatPanel.open({ model: movedWidget.model });
          }
          if (shouldFocus) {
            focusOnChat(area, movedWidget);
          }
          applyInputArgs(movedWidget.model, {
            ...args,
            focus: shouldFocus
          });

          return true;
        }

        if (area === 'side') {
          chatPanel.open({ model: existingWidget.model });
        }
        if (shouldFocus) {
          focusOnChat(area, existingWidget);
        }
        applyInputArgs(existingWidget.model, {
          ...args,
          focus: shouldFocus
        });

        return true;
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {
            area: {
              type: 'string',
              enum: ['main', 'side'],
              description: trans.__(
                'The name of the area to open or reveal the chat in'
              )
            },
            name: {
              type: 'string',
              description: trans.__('The name of the chat')
            },
            provider: {
              type: 'string',
              description: trans.__('The provider/model to use with this chat')
            },
            input: {
              type: 'string',
              description: trans.__('The input text to prefill in the chat')
            },
            focus: {
              type: 'boolean',
              description: trans.__(
                'Whether to focus the chat input after opening it'
              )
            },
            autoSend: {
              type: 'boolean',
              description: trans.__(
                'Whether to auto-send the provided input after opening the chat'
              )
            }
          }
        }
      }
    });

    commands.addCommand(CommandIds.moveChat, {
      caption: trans.__('Move chat between area'),
      execute: async (args): Promise<boolean> => {
        const area = args.area as string;
        if (!['side', 'main'].includes(area)) {
          console.error(
            'Error while moving the chat to main area: the area has not been provided or is not correct'
          );
          return false;
        }
        if (!args.name || !args.area) {
          console.error(
            'Error while moving the chat to main area: the name has not been provided'
          );
          return false;
        }
        let previousWidget: ChatWidget | MainAreaChat | undefined;
        let previousModel: AIChatModel | undefined;
        tracker.forEach(widget => {
          if (widget.model.name === args.name) {
            previousWidget = widget;
            previousModel = widget.model as AIChatModel;
          }
        });

        if (!previousModel) {
          console.error(
            'Error while moving the chat to main area: there is no reference model'
          );
          return false;
        }

        // Listen for the widget updated in tracker, to ensure the previous model name
        // has been updated. This is required to remove the widget from the restorer
        // when the previous widget is disposed.
        const trackerUpdated = new PromiseDelegate<boolean>();
        const widgetUpdated = (_: any, widget: ChatWidget | MainAreaChat) => {
          if (widget.model === previousModel) {
            trackerUpdated.resolve(true);
          }
        };
        tracker.widgetUpdated.connect(widgetUpdated);

        // Rename temporary the previous model to be able to reuse this name for the new
        // model. The previous is intended to be disposed anyway.
        previousModel.name = UUID.uuid4();

        // Create a new model by duplicating the previous model attributes.
        const model = modelRegistry.createModel({
          name: args.name as string,
          activeProvider: previousModel.agentManager.activeProvider,
          tokenUsage: previousModel.agentManager.tokenUsage,
          messages: previousModel.messages,
          autosave: previousModel.autosave,
          title: previousModel.title
        });

        // Wait (with timeout) for the tracker to have updated the previous widget.
        const status = await Promise.any([
          trackerUpdated.promise,
          new Promise<boolean>(r =>
            setTimeout(() => {
              r(false);
            }, 2000)
          )
        ]);
        tracker.widgetUpdated.disconnect(widgetUpdated);

        if (!status) {
          return false;
        }

        if (area === 'main') {
          openInMain(model);

          if (previousWidget instanceof ChatWidget) {
            // Clean up the side-panel model entry before disposing the previous
            // widget/model state.
            if (!disposeSideChatModel(previousModel)) {
              previousWidget.dispose();
              previousModel.dispose();
            }
          }
        } else {
          previousWidget?.dispose();
          previousModel.dispose();
          chatPanel.open({ model });
        }

        return true;
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {
            area: {
              type: 'string',
              enum: ['main', 'side'],
              description: trans.__('The area to move the chat to')
            },
            name: {
              type: 'string',
              description: trans.__('The name of the chat to move')
            }
          },
          requires: ['area', 'name']
        }
      }
    });

    commands.addCommand(CommandIds.saveChat, {
      label: args => (args.isPalette ? trans.__('Save chat') : ''),
      caption: trans.__('Save the chat as local file'),
      icon: saveIcon,
      execute: async (args): Promise<boolean> => {
        let model: AIChatModel | null = null;
        if (args.name) {
          tracker.forEach(widget => {
            if (widget.model.name === args.name) {
              model = widget.model as AIChatModel;
            }
          });
        } else {
          model = (tracker.currentWidget?.model as AIChatModel) ?? null;
        }
        if (model === null) {
          console.log('No chat to save');
          return false;
        }

        model.save();
        return true;
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {
            isPalette: {
              type: 'boolean',
              description: trans.__('Whether the command is in palette')
            },
            name: {
              type: 'string',
              description: trans.__('The name of the chat to save')
            }
          }
        }
      }
    });

    commands.addCommand(CommandIds.restoreChat, {
      label: args => (args.isPalette ? trans.__('Restore chat') : ''),
      caption: trans.__('Restore the chat from a local file'),
      icon: fileUploadIcon,
      isVisible: () => !!documentManager,
      execute: async (args): Promise<boolean> => {
        if (!documentManager) {
          console.warn('The restoration is not possible');
          return false;
        }
        let model: AIChatModel | null = null;
        if (args.name) {
          tracker.forEach(widget => {
            if (widget.model.name === args.name) {
              model = widget.model as AIChatModel;
            }
          });
        } else {
          model = (tracker.currentWidget?.model as AIChatModel) ?? null;
        }
        if (model === null) {
          console.warn('There is no chat to restore');
          return false;
        }

        let backupDirExists = false;
        await app.serviceManager.contents
          .get(settingsModel.config.chatBackupDirectory, { content: false })
          .then(() => (backupDirExists = true))
          .catch(() => (backupDirExists = false));

        const selection = await FileDialog.getOpenFiles({
          title: trans.__('Select files to attach'),
          manager: documentManager,
          defaultPath: backupDirExists
            ? settingsModel.config.chatBackupDirectory
            : ''
        });

        const filepath = selection.value?.[0].path;

        if (!filepath) {
          return false;
        }

        if (model.messages.length) {
          const result = await showDialog({
            body: trans.__('All the message will be deleted')
          });
          if (!result.button.accept) {
            return false;
          }
        }
        return model.restore(filepath);
      },
      describedBy: {
        args: {
          type: 'object',
          properties: {
            isPalette: {
              type: 'boolean',
              description: trans.__('Whether the command is in palette')
            },
            name: {
              type: 'string',
              description: trans.__('The name of the chat to save')
            }
          }
        }
      }
    });

    if (palette) {
      palette.addItem({
        category: trans.__('AI Assistant'),
        command: CommandIds.saveChat,
        args: {
          isPalette: true
        }
      });
      palette.addItem({
        category: trans.__('AI Assistant'),
        command: CommandIds.restoreChat,
        args: {
          isPalette: true
        }
      });
    }
  }
}

/**
 * A plugin to provide the agent manager factory and completion provider.
 * These objects require the secrets manager token with the same namespace.
 */
const agentManagerFactory: JupyterFrontEndPlugin<IAgentManagerFactory> =
  SecretsManager.sign(SECRETS_NAMESPACE, token => {
    Private.setAISecretsToken(token);

    return {
      id: SECRETS_NAMESPACE,
      description: 'Provide the AI agent manager',
      autoStart: true,
      provides: IAgentManagerFactory,
      requires: [IAISettingsModel, IProviderRegistry],
      optional: [ISkillRegistry, ICompletionProviderManager, ISecretsManager],
      activate: (
        app: JupyterFrontEnd,
        settingsModel: IAISettingsModel,
        providerRegistry: IProviderRegistry,
        skillRegistry?: ISkillRegistry,
        completionManager?: ICompletionProviderManager,
        secretsManager?: ISecretsManager
      ): IAgentManagerFactory => {
        const agentManagerFactory = new AgentManagerFactory({
          settingsModel,
          skillRegistry,
          secretsManager,
          token
        });

        // Build the completion provider
        if (completionManager) {
          const completionProvider = new AICompletionProvider({
            settingsModel,
            providerRegistry,
            secretsManager,
            token
          });

          completionManager.registerInlineProvider(completionProvider);
        } else {
          console.info(
            'Completion provider manager not available, skipping AI completion setup'
          );
        }

        return agentManagerFactory;
      }
    };
  });

/**
 * AI settings panel plugin.
 */
const settingsPanelPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:settings-panel',
  description: 'Provide the AI settings panel',
  autoStart: true,
  requires: [IAISettingsModel, IAgentManagerFactory, IProviderRegistry],
  optional: [
    ICommandPalette,
    ILayoutRestorer,
    ISecretsManager,
    IThemeManager,
    ITranslator
  ],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    agentManagerFactory: IAgentManagerFactory,
    providerRegistry: IProviderRegistry,
    palette?: ICommandPalette,
    restorer?: ILayoutRestorer,
    secretsManager?: ISecretsManager,
    themeManager?: IThemeManager,
    translator?: ITranslator
  ): void => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const secretsAccess = Private.createAISecretsAccess(secretsManager);

    const settingsWidget = new AISettingsWidget({
      settingsModel,
      agentManagerFactory,
      themeManager,
      providerRegistry,
      secretsAccess,
      trans
    });
    settingsWidget.title.icon = settingsIcon;
    settingsWidget.title.iconClass = 'jp-ai-settings-icon';

    const open = () => {
      let widget = Array.from(app.shell.widgets('main')).find(
        w => w.id === 'jupyterlite-ai-settings'
      ) as AISettingsWidget | undefined;

      if (!widget) {
        widget = settingsWidget;
        app.shell.add(widget, 'main');
      }

      app.shell.activateById(widget.id);
    };

    if (restorer) {
      restorer.add(settingsWidget, settingsWidget.id);
    }

    app.commands.addCommand(CommandIds.openSettings, {
      label: trans.__('AI Settings'),
      caption: trans.__('Configure AI providers and behavior'),
      icon: settingsIcon,
      iconClass: 'jp-ai-settings-icon',
      execute: () => {
        open();
      },
      describedBy: {
        args: {}
      }
    });

    if (palette) {
      palette.addItem({
        command: CommandIds.openSettings,
        category: trans.__('AI Assistant')
      });
    }
  }
};

/**
 * Built-in completion providers plugin
 */
const settingsModel: JupyterFrontEndPlugin<IAISettingsModel> = {
  id: '@jupyterlite/ai:settings-model',
  description: 'Provide the AI settings model',
  autoStart: true,
  provides: IAISettingsModel,
  requires: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry
  ): IAISettingsModel => {
    return new AISettingsModel({ settingRegistry });
  }
};

/**
 * Diff manager plugin
 */
const diffManager: JupyterFrontEndPlugin<IDiffManager> = {
  id: '@jupyterlite/ai:diff-manager',
  description: 'Provide the diff manager for notebook cell diffs',
  autoStart: true,
  provides: IDiffManager,
  requires: [IAISettingsModel],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel
  ): IDiffManager => {
    return new DiffManager({
      commands: app.commands,
      settingsModel
    });
  }
};

/**
 * Skill registry plugin
 */
const skillRegistryPlugin: JupyterFrontEndPlugin<ISkillRegistry> = {
  id: '@jupyterlite/ai:skill-registry',
  description: 'Provide the skill registry',
  autoStart: true,
  provides: ISkillRegistry,
  activate: () => {
    return new SkillRegistry();
  }
};

const toolRegistry: JupyterFrontEndPlugin<IToolRegistry> = {
  id: '@jupyterlite/ai:tool-registry',
  description: 'Provide the AI tool registry',
  autoStart: true,
  requires: [IAISettingsModel],
  optional: [ISkillRegistry],
  provides: IToolRegistry,
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    skillRegistry?: ISkillRegistry
  ) => {
    const toolRegistry = new ToolRegistry();

    // Add command operation tools
    const discoverCommandsTool = createDiscoverCommandsTool(app.commands);
    const executeCommandTool = createExecuteCommandTool(
      app.commands,
      settingsModel
    );

    toolRegistry.add('discover_commands', discoverCommandsTool);
    toolRegistry.add('execute_command', executeCommandTool);
    toolRegistry.add('browser_fetch', createBrowserFetchTool());
    if (skillRegistry) {
      toolRegistry.add(
        'discover_skills',
        createDiscoverSkillsTool(skillRegistry)
      );
      toolRegistry.add('load_skill', createLoadSkillTool(skillRegistry));
    }

    return toolRegistry;
  }
};

/**
 * Extension providing the input toolbar registry.
 */
const inputToolbarFactory: JupyterFrontEndPlugin<IInputToolbarRegistryFactory> =
  {
    id: '@jupyterlite/ai:input-toolbar-factory',
    description: 'The input toolbar registry plugin.',
    autoStart: true,
    provides: IInputToolbarRegistryFactory,
    requires: [IAISettingsModel, IToolRegistry, IProviderRegistry],
    optional: [ITranslator],
    activate: (
      app: JupyterFrontEnd,
      settingsModel: IAISettingsModel,
      toolRegistry: IToolRegistry,
      providerRegistry: IProviderRegistry,
      translator?: ITranslator
    ): IInputToolbarRegistryFactory => {
      const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
      const stopButton = stopItem(trans);
      const clearButton = clearItem(trans);
      const toolSelectButton = createToolSelectItem(
        toolRegistry,
        settingsModel,
        providerRegistry,
        settingsModel.config.toolsEnabled,
        trans
      );
      const modelSelectButton = createModelSelectItem(settingsModel, trans);

      return {
        create() {
          const inputToolbarRegistry =
            InputToolbarRegistry.defaultToolbarRegistry();
          inputToolbarRegistry.addItem('stop', stopButton);
          inputToolbarRegistry.addItem('clear', clearButton);
          inputToolbarRegistry.addItem('model', modelSelectButton);
          inputToolbarRegistry.addItem('tools', toolSelectButton);

          // Listen for settings changes to update tool availability
          settingsModel.stateChanged.connect(() => {
            const config = settingsModel.config;
            if (!config.toolsEnabled) {
              inputToolbarRegistry.hide('tools');
            } else {
              inputToolbarRegistry.show('tools');
            }
          });

          return inputToolbarRegistry;
        }
      };
    }
  };

const completionStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:completion-status',
  description: 'The completion status displayed in the status bar',
  autoStart: true,
  requires: [IAISettingsModel],
  optional: [IStatusBar, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    statusBar: IStatusBar | null,
    translator?: ITranslator
  ) => {
    if (!statusBar) {
      return;
    }
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const item = new CompletionStatusWidget({
      settingsModel,
      translator: trans
    });
    statusBar?.registerStatusItem('completionState', {
      item,
      align: 'right',
      rank: 10
    });
  }
};

/**
 * Skills plugin: discovers and registers agent skills from the filesystem.
 */
const skillsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:skills',
  description: 'Discover and register agent skills',
  autoStart: true,
  requires: [IAISettingsModel, IDocumentManager, ISkillRegistry],
  optional: [ICommandPalette, ITranslator],
  activate: async (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    docManager: IDocumentManager,
    skillRegistry: ISkillRegistry,
    palette?: ICommandPalette,
    translator?: ITranslator
  ) => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    const validateResourcePath = (resourcePath: string): string | null => {
      if (resourcePath.startsWith('/')) {
        return null;
      }

      const normalized = PathExt.normalize(resourcePath);
      if (normalized.startsWith('..') || normalized === '') {
        return null;
      }

      return normalized;
    };

    let currentSkillsPaths = settingsModel.config.skillsPaths;
    let currentSkillDisposables = new DisposableSet();

    const loadAndRegister = async () => {
      const skillsPaths = settingsModel.config.skillsPaths;
      const skills = await loadSkillsFromPaths(
        docManager.services.contents,
        skillsPaths
      );

      const registrations = skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        resources: skill.resources,
        loadResource: async (resource: string) => {
          const validatedPath = validateResourcePath(resource);
          if (validatedPath === null) {
            return {
              name: skill.name,
              resource,
              error: 'Invalid resource path: path traversal not allowed'
            };
          }

          if (!skill.resources.includes(validatedPath)) {
            return {
              name: skill.name,
              resource,
              error: `Resource not found: ${resource}`
            };
          }

          const resourcePath = `${skill.path}/${validatedPath}`;
          try {
            const fileModel = await docManager.services.contents.get(
              resourcePath,
              {
                content: true
              }
            );
            if (typeof fileModel.content !== 'string') {
              return {
                name: skill.name,
                resource,
                error: 'Resource content is not a string'
              };
            }
            return {
              name: skill.name,
              resource,
              content: fileModel.content
            };
          } catch (error) {
            return {
              name: skill.name,
              resource,
              error: `Failed to read resource: ${error}`
            };
          }
        }
      }));

      currentSkillDisposables.dispose();
      currentSkillDisposables = new DisposableSet();
      for (const registration of registrations) {
        currentSkillDisposables.add(skillRegistry.registerSkill(registration));
      }
    };

    app.commands.addCommand(CommandIds.refreshSkills, {
      label: trans.__('Refresh Agents Skills'),
      caption: trans.__(
        'Re-scan the agents skills directory and update the registry'
      ),
      execute: async () => {
        await loadAndRegister();
      }
    });

    if (palette) {
      palette.addItem({
        command: CommandIds.refreshSkills,
        category: trans.__('AI Assistant')
      });
    }

    loadAndRegister().catch(error =>
      console.warn('Failed to load skills on activation:', error)
    );

    settingsModel.stateChanged.connect(() => {
      const newPaths = settingsModel.config.skillsPaths;
      if (
        newPaths.length === currentSkillsPaths.length &&
        newPaths.every((p, i) => p === currentSkillsPaths[i])
      ) {
        return;
      }
      currentSkillsPaths = newPaths;
      loadAndRegister().catch(error =>
        console.warn('Failed to reload skills:', error)
      );
    });
  }
};

export default [
  providerRegistryPlugin,
  anthropicProviderPlugin,
  googleProviderPlugin,
  mistralProviderPlugin,
  openaiProviderPlugin,
  genericProviderPlugin,
  settingsModel,
  diffManager,
  chatCommandRegistryPlugin,
  clearCommandPlugin,
  skillRegistryPlugin,
  skillsCommandPlugin,
  chatModelHandler,
  activeCellManager,
  plugin,
  toolRegistry,
  agentManagerFactory,
  settingsPanelPlugin,
  inputToolbarFactory,
  completionStatus,
  skillsPlugin
];

// Export extension points for other extensions to use
export * from './tokens';
export * from './icons';
