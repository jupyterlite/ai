import {
  IAgentManagerFactory,
  IAISettingsModel,
  IProviderRegistry,
  IToolRegistry,
  ISkillRegistry
} from '@jupyternaut/agent';

import type { IProviderConfig } from '@jupyternaut/agent';

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

import { IDocumentManager } from '@jupyterlab/docmanager';

import { FileDialog } from '@jupyterlab/filebrowser';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { INotebookTracker } from '@jupyterlab/notebook';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

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

import { UUID } from '@lumino/coreutils';

import { CommandRegistry } from '@lumino/commands';

import { IPersonaRegistry } from '@jupyternaut/persona';

import { IComponentsRendererFactory } from 'jupyter-chat-components';

import { RenderedMessageOutputAreaCompat } from './rendered-message-outputarea';

import { ClearCommandProvider } from './chat-commands/clear';

import { SkillsCommandProvider } from './chat-commands/skills';

import { SaveComponentWidget } from './components/save-button';

import { ChatModelHandler } from './chat-model-handler';

import { CommandIds, IChatModelHandler, IAIChatModel } from './tokens';

import {
  clearItem,
  createModelSelectItem,
  createToolSelectItem,
  stopItem,
  UsageWidget
} from './components';

import { MainAreaChat } from './widgets/main-area-chat';

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
    IRenderMimeRegistry,
    IPersonaRegistry,
    ISettingRegistry
  ],
  optional: [IProviderRegistry, IToolRegistry, ITranslator],
  provides: IChatModelHandler,
  activate: async (
    app: JupyterFrontEnd,
    settingsModel: IAISettingsModel,
    agentManagerFactory: IAgentManagerFactory,
    docManager: IDocumentManager,
    rmRegistry: IRenderMimeRegistry,
    personaRegistry: IPersonaRegistry,
    settingRegistry: ISettingRegistry,
    providerRegistry?: IProviderRegistry,
    toolRegistry?: IToolRegistry
  ): Promise<IChatModelHandler> => {
    await app.serviceManager.ready;

    let chatSettings: ISettingRegistry.ISettings | undefined;
    try {
      chatSettings = await settingRegistry.load(chatTracker.id);
    } catch (error) {
      console.warn('Failed to load AI chat settings:', error);
    }

    return new ChatModelHandler({
      settingsModel,
      personaRegistry,
      chatSettings,
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
const chatTracker: JupyterFrontEndPlugin<IChatTracker> = {
  id: '@jupyterlite/ai:chat',
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
    ISettingRegistry,
    IThemeManager,
    ILayoutRestorer,
    ILabShell,
    ITranslator,
    IComponentsRendererFactory,
    ICommandPalette,
    IDocumentManager,
    IPersonaRegistry
  ],
  activate: async (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
    inputToolbarFactory: IInputToolbarRegistryFactory,
    modelHandler: IChatModelHandler,
    settingsModel: IAISettingsModel,
    chatCommandRegistry: IChatCommandRegistry,
    settingRegistry?: ISettingRegistry,
    themeManager?: IThemeManager,
    restorer?: ILayoutRestorer,
    labShell?: ILabShell,
    translator?: ITranslator,
    chatComponentsFactory?: IComponentsRendererFactory,
    palette?: ICommandPalette,
    documentManager?: IDocumentManager,
    personaRegistry?: IPersonaRegistry
  ): Promise<IChatTracker> => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');

    let chatSettings: ISettingRegistry.ISettings | undefined;
    try {
      chatSettings = await settingRegistry?.load(chatTracker.id);
    } catch (error) {
      console.warn('Failed to load AI chat settings in plugin:', error);
    }

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
      const model = widget.model as IAIChatModel;

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
      model.agentManager?.activeProviderChanged.connect(saveTracker);

      // Update the token usage widget.
      usageWidget?.dispose();

      usageWidget = new UsageWidget({
        tokenUsageChanged: model.tokenUsageChanged,
        chatSettings,
        initialTokenUsage: model.agentManager?.tokenUsage,
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
        // Check if a bot is currently writing (streaming)
        const aiWriting = writers.some(writer => writer.user.bot === true);

        if (aiWriting) {
          widget.inputToolbarRegistry?.show('stop');
        } else {
          widget.inputToolbarRegistry?.hide('stop');
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
        model.agentManager?.activeProviderChanged.disconnect(saveTracker);
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
          provider: (widget.model as IAIChatModel).agentManager?.activeProvider
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
      chatSettings,
      themeManager,
      labShell,
      palette,
      documentManager
    );

    const findModel = (targetId: string) => {
      return tracker.find(chat => chat.model.name === targetId)?.model as
        | IAIChatModel
        | undefined;
    };

    const findPersona = (targetId: string) => {
      const model = tracker.find(chat => chat.model.name === targetId)?.model;
      return model ? personaRegistry?.get(model) : undefined;
    };

    if (chatComponentsFactory) {
      chatComponentsFactory.groupedToolCallCallbacks = {
        ...chatComponentsFactory.groupedToolCallCallbacks,
        toolCallPermissionDecision: (
          sessionId: string,
          toolCallId: string,
          optionId: string
        ) => {
          const agent = findPersona(sessionId)?.agentManager;
          if (!agent) {
            return;
          }
          const isApproved = optionId === 'approve';
          isApproved
            ? agent.approveToolCall(toolCallId)
            : agent.rejectToolCall(toolCallId);
        }
      };

      chatComponentsFactory.queueMessageCallbacks = {
        ...chatComponentsFactory.queueMessageCallbacks,
        removeQueuedMessage: (targetId: string, messageId: string) => {
          findModel(targetId)?.removeQueuedMessage(messageId);
        },
        reorderQueuedMessages: (targetId: string, messageIds: string[]) => {
          findModel(targetId)?.reorderQueuedMessages(messageIds);
        },
        editQueuedMessage: (
          targetId: string,
          messageId: string,
          newBody: string
        ) => {
          findModel(targetId)?.editQueuedMessage(messageId, newBody);
        }
      };
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
  chatSettings?: ISettingRegistry.ISettings,
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

    const openInMain = (model: IAIChatModel): MainAreaChat => {
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
        chatSettings,
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
      model.agentManager?.activeProviderChanged.connect(saveTracker);

      widget.disposed.connect(() => {
        model.nameChanged.disconnect(saveTracker);
        model.agentManager?.activeProviderChanged.disconnect(saveTracker);
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
        const model = widget.model as IAIChatModel;
        return (
          (!name || widget.model.name === name) &&
          (!provider || model.agentManager?.activeProvider === provider)
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
        let previousModel: IAIChatModel | undefined;
        tracker.forEach(widget => {
          if (widget.model.name === args.name) {
            previousWidget = widget;
            previousModel = widget.model as IAIChatModel;
          }
        });

        if (!previousModel) {
          console.error(
            'Error while moving the chat to main area: there is no reference model'
          );
          return false;
        }

        if (area === 'main') {
          // Temporarily bypass model disposal to transport model to main view
          // to keep the conversation when switching views
          // TODO: Remove this code when jupyter-chat PR #423 is merged and released
          const originalDispose = previousModel.dispose.bind(previousModel);
          previousModel.dispose = () => {};

          if (previousWidget instanceof ChatWidget) {
            if (!disposeSideChatModel(previousModel)) {
              previousWidget.dispose();
            }
          }

          // Restore model disposal and transport to main view
          previousModel.dispose = originalDispose;
          openInMain(previousModel);
        } else {
          // MainAreaChat disposal does not dispose the model internally, so this is safe.
          previousWidget?.dispose();
          chatPanel.open({ model: previousModel });
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
        let model: IAIChatModel | null = null;
        if (args.name) {
          tracker.forEach(widget => {
            if (widget.model.name === args.name) {
              model = widget.model as IAIChatModel;
            }
          });
        } else {
          model = (tracker.currentWidget?.model as IAIChatModel) ?? null;
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
        let model: IAIChatModel | null = null;
        if (args.name) {
          tracker.forEach(widget => {
            if (widget.model.name === args.name) {
              model = widget.model as IAIChatModel;
            }
          });
        } else {
          model = (tracker.currentWidget?.model as IAIChatModel) ?? null;
        }
        if (model === null) {
          console.warn('There is no chat to restore');
          return false;
        }

        const chatBackupDirectory =
          (chatSettings?.composite['chatBackupDirectory'] as
            | string
            | undefined) ?? '';
        let backupDirExists = false;
        await app.serviceManager.contents
          .get(chatBackupDirectory, { content: false })
          .then(() => (backupDirExists = true))
          .catch(() => (backupDirExists = false));

        const selection = await FileDialog.getOpenFiles({
          title: trans.__('Select files to attach'),
          manager: documentManager,
          defaultPath: backupDirExists ? chatBackupDirectory : ''
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
 * Extension providing the input toolbar registry.
 */
const inputToolbarFactory: JupyterFrontEndPlugin<IInputToolbarRegistryFactory> =
  {
    id: '@jupyterlite/ai:input-toolbar-factory',
    description: 'The input toolbar registry plugin.',
    autoStart: true,
    provides: IInputToolbarRegistryFactory,
    requires: [IAISettingsModel, IToolRegistry, IProviderRegistry],
    optional: [ITranslator, IPersonaRegistry],
    activate: (
      app: JupyterFrontEnd,
      settingsModel: IAISettingsModel,
      toolRegistry: IToolRegistry,
      providerRegistry: IProviderRegistry,
      translator?: ITranslator,
      personaHandlerRegistry?: IPersonaRegistry
    ): IInputToolbarRegistryFactory => {
      const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
      const stopButton = stopItem(trans);
      const clearButton = clearItem(trans);
      const toolSelectButton = createToolSelectItem(
        toolRegistry,
        settingsModel,
        providerRegistry,
        settingsModel.config.toolsEnabled,
        trans,
        personaHandlerRegistry
      );
      const modelSelectButton = createModelSelectItem(
        settingsModel,
        trans,
        personaHandlerRegistry
      );

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

export default [
  chatCommandRegistryPlugin,
  clearCommandPlugin,
  skillsCommandPlugin,
  chatModelHandler,
  activeCellManager,
  chatTracker,
  inputToolbarFactory
];

// Export extension points for other extensions to use
export * from './tokens';
