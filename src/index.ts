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
  ChatWidget,
  IAttachmentOpenerRegistry,
  IInputToolbarRegistryFactory,
  InputToolbarRegistry,
  MultiChatPanel
} from '@jupyter/chat';

import {
  ICommandPalette,
  IThemeManager,
  WidgetTracker
} from '@jupyterlab/apputils';

import { ICompletionProviderManager } from '@jupyterlab/completer';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { IEditorTracker } from '@jupyterlab/fileeditor';

import { INotebookTracker } from '@jupyterlab/notebook';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { IKernelSpecManager, KernelSpec } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStatusBar } from '@jupyterlab/statusbar';

import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';

import {
  settingsIcon,
  Toolbar,
  ToolbarButton
} from '@jupyterlab/ui-components';

import { ISecretsManager, SecretsManager } from 'jupyter-secrets-manager';

import { PromiseDelegate, UUID } from '@lumino/coreutils';

import { AgentManagerFactory } from './agent';

import { AIChatModel } from './chat-model';

import { ProviderRegistry } from './providers/provider-registry';

import { ApprovalButtons } from './approval-buttons';

import { ChatModelRegistry } from './chat-model-registry';

import {
  CommandIds,
  IAgentManagerFactory,
  IProviderRegistry,
  IToolRegistry,
  SECRETS_NAMESPACE,
  IAISettingsModel,
  IChatModelRegistry,
  IDiffManager
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
  TokenUsageWidget
} from './components';

import { AISettingsModel } from './models/settings-model';

import { DiffManager } from './diff-manager';

import { ToolRegistry } from './tools/tool-registry';

import {
  createAddCellTool,
  createDeleteCellTool,
  createExecuteActiveCellTool,
  createGetCellInfoTool,
  createGetNotebookInfoTool,
  createNotebookCreationTool,
  createRunCellTool,
  createSaveNotebookTool,
  createSetCellContentTool
} from './tools/notebook';

import {
  createCopyFileTool,
  createDeleteFileTool,
  createGetFileInfoTool,
  createNavigateToDirectoryTool,
  createNewFileTool,
  createOpenFileTool,
  createRenameFileTool,
  createSetFileContentTool
} from './tools/file';

import {
  createDiscoverCommandsTool,
  createExecuteCommandTool
} from './tools/commands';

import { AISettingsWidget } from './widgets/ai-settings';

import { MainAreaChat } from './widgets/main-area-chat';

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
 * The chat model registry.
 */
const chatModelRegistry: JupyterFrontEndPlugin<IChatModelRegistry> = {
  id: '@jupyterlite/ai:chat-model-registry',
  description: 'Registry for the current chat model',
  autoStart: true,
  requires: [IAISettingsModel, IAgentManagerFactory, IDocumentManager],
  optional: [IProviderRegistry, INotebookTracker, IToolRegistry],
  provides: IChatModelRegistry,
  activate: (
    app: JupyterFrontEnd,
    settingsModel: AISettingsModel,
    agentManagerFactory: AgentManagerFactory,
    docManager: IDocumentManager,
    providerRegistry?: IProviderRegistry,
    notebookTracker?: INotebookTracker,
    toolRegistry?: IToolRegistry
  ): IChatModelRegistry => {
    // Create ActiveCellManager if notebook tracker is available
    let activeCellManager: ActiveCellManager | undefined;
    if (notebookTracker) {
      activeCellManager = new ActiveCellManager({
        tracker: notebookTracker,
        shell: app.shell
      });
    }
    return new ChatModelRegistry({
      activeCellManager,
      settingsModel,
      agentManagerFactory,
      docManager,
      providerRegistry,
      toolRegistry
    });
  }
};

/**
 * Initialization data for the extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:plugin',
  description: 'AI in JupyterLab',
  autoStart: true,
  requires: [
    IRenderMimeRegistry,
    IInputToolbarRegistryFactory,
    IChatModelRegistry,
    IAISettingsModel
  ],
  optional: [IThemeManager, ILayoutRestorer, ILabShell, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
    inputToolbarFactory: IInputToolbarRegistryFactory,
    modelRegistry: IChatModelRegistry,
    settingsModel: AISettingsModel,
    themeManager?: IThemeManager,
    restorer?: ILayoutRestorer,
    labShell?: ILabShell,
    translator?: ITranslator
  ): void => {
    const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
    // Create attachment opener registry to handle file attachments
    const attachmentOpenerRegistry = new AttachmentOpenerRegistry();
    attachmentOpenerRegistry.set('file', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    attachmentOpenerRegistry.set('notebook', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    // Create chat panel with drag/drop functionality
    const chatPanel = new MultiChatPanel({
      rmRegistry,
      themeManager: themeManager ?? null,
      inputToolbarFactory,
      attachmentOpenerRegistry,
      createModel: async (name?: string) => {
        const model = modelRegistry.createModel(name);
        return { model };
      },
      renameChat: async (oldName: string, newName: string) => {
        const model = modelRegistry.get(oldName);
        const concurrencyModel = modelRegistry.get(newName);
        if (model && !concurrencyModel) {
          model.name = newName;
          return true;
        }
        return false;
      },
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
    chatPanel.toolbar.addItem(
      'settings',
      new ToolbarButton({
        icon: settingsIcon,
        onClick: () => {
          app.commands.execute('@jupyterlite/ai:open-settings');
        },
        tooltip: trans.__('Open AI Settings')
      })
    );

    chatPanel.sectionAdded.connect((_, section) => {
      const { widget } = section;
      const model = section.model as AIChatModel;

      // Add the widget to the tracker.
      tracker.add(widget);

      // Update the tracker if the model name changed.
      model.nameChanged.connect(() => tracker.save(widget));
      // Update the tracker if the active provider changed.
      model.agentManager.activeProviderChanged.connect(() =>
        tracker.save(widget)
      );

      const tokenUsageWidget = new TokenUsageWidget({
        tokenUsageChanged: model.tokenUsageChanged,
        settingsModel,
        initialTokenUsage: model.agentManager.tokenUsage,
        translator: trans
      });
      section.toolbar.insertBefore('markRead', 'token-usage', tokenUsageWidget);
      model.writersChanged?.connect((_, writers) => {
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
      });

      // Associate an approval buttons object to the chat.
      const approvalButton = new ApprovalButtons({
        chatPanel: widget,
        trans
      });

      widget.disposed.connect(() => {
        // Dispose of the approval buttons widget when the chat is disposed.
        approvalButton.dispose();
        // Remove the model from the registry when the widget is disposed.
        modelRegistry.remove(model.name);
      });
    });

    app.shell.add(chatPanel, 'left', { rank: 1000 });

    // Creating the tracker for the document
    const namespace = 'ai-chat';
    const tracker = new WidgetTracker<MainAreaChat | ChatWidget>({ namespace });

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
      if (
        !modelRegistry.getAll().length &&
        settingsModel.config.defaultProvider
      ) {
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
      tracker,
      modelRegistry,
      trans,
      themeManager,
      labShell
    );
  }
};

function registerCommands(
  app: JupyterFrontEnd,
  rmRegistry: IRenderMimeRegistry,
  chatPanel: MultiChatPanel,
  attachmentOpenerRegistry: IAttachmentOpenerRegistry,
  inputToolbarFactory: IInputToolbarRegistryFactory,
  settingsModel: AISettingsModel,
  tracker: WidgetTracker<MainAreaChat | ChatWidget>,
  modelRegistry: IChatModelRegistry,
  trans: TranslationBundle,
  themeManager?: IThemeManager,
  labShell?: ILabShell
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

    const openInMain = (model: AIChatModel) => {
      const content = new ChatWidget({
        model,
        rmRegistry,
        themeManager: themeManager ?? null,
        inputToolbarRegistry: inputToolbarFactory.create(),
        attachmentOpenerRegistry
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

      // Update the tracker if the model name changed.
      model.nameChanged.connect(() => tracker.save(widget));
      // Update the tracker if the active provider changed.
      model.agentManager.activeProviderChanged.connect(() =>
        tracker.save(widget)
      );

      // Remove the model from the registry when the widget is disposed.
      widget.disposed.connect(() => {
        modelRegistry.remove(model.name);
      });
    };

    commands.addCommand(CommandIds.openChat, {
      label: trans.__('Open a chat'),
      execute: async (args): Promise<boolean> => {
        const area = (args.area as string) === 'main' ? 'main' : 'side';
        const provider = (args.provider as string) ?? undefined;

        // Do not open the chat if the provider in args does not exists in settings.
        if (provider && !settingsModel.getProvider(provider)) {
          return false;
        }
        const model = modelRegistry.createModel(
          args.name ? (args.name as string) : undefined,
          provider
        );
        if (!model) {
          return false;
        }

        if (area === 'main') {
          openInMain(model);
        } else {
          chatPanel.addChat({ model });
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
              description: trans.__('The name of the area to open the chat to')
            },
            name: {
              type: 'string',
              description: trans.__('The name of the chat')
            },
            provider: {
              type: 'string',
              description: trans.__('The provider/model to use with this chat')
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
        const previousModel = modelRegistry.get(args.name as string);
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
        const model = modelRegistry.createModel(
          args.name as string,
          previousModel?.agentManager.activeProvider,
          previousModel?.agentManager.tokenUsage
        );
        previousModel?.messages.forEach(message =>
          model?.messageAdded(message)
        );

        // Wait (with timeout) for the tracker to have updated the previous widget.
        const status = await Promise.any([
          trackerUpdated.promise,
          new Promise<boolean>(r =>
            setTimeout(() => {
              return false;
            }, 2000)
          )
        ]);
        tracker.widgetUpdated.disconnect(widgetUpdated);

        if (!status) {
          return false;
        }

        if (area === 'main') {
          openInMain(model);
        } else {
          const current = app.shell.currentWidget;
          // Remove the current main area chat.
          if (
            current instanceof MainAreaChat &&
            current.model.name === previousModel.name
          ) {
            current.dispose();
          }
          chatPanel.addChat({ model });
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
              description: trans.__('The name of the area to move the chat to')
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
  }
}

/**
 * A plugin to provide the settings model.
 */
const agentManagerFactory: JupyterFrontEndPlugin<AgentManagerFactory> =
  SecretsManager.sign(SECRETS_NAMESPACE, token => ({
    id: SECRETS_NAMESPACE,
    description: 'Provide the AI agent manager',
    autoStart: true,
    provides: IAgentManagerFactory,
    requires: [IAISettingsModel, IProviderRegistry],
    optional: [
      ICommandPalette,
      ICompletionProviderManager,
      ILayoutRestorer,
      ISecretsManager,
      IThemeManager,
      ITranslator
    ],
    activate: (
      app: JupyterFrontEnd,
      settingsModel: AISettingsModel,
      providerRegistry: IProviderRegistry,
      palette: ICommandPalette,
      completionManager?: ICompletionProviderManager,
      restorer?: ILayoutRestorer,
      secretsManager?: ISecretsManager,
      themeManager?: IThemeManager,
      translator?: ITranslator
    ): AgentManagerFactory => {
      const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
      const agentManagerFactory = new AgentManagerFactory({
        settingsModel,
        secretsManager,
        token
      });

      // Build the settings panel
      const settingsWidget = new AISettingsWidget({
        settingsModel,
        agentManagerFactory,
        themeManager,
        providerRegistry,
        secretsManager,
        token,
        trans
      });
      settingsWidget.id = 'jupyterlite-ai-settings';
      settingsWidget.title.icon = settingsIcon;
      settingsWidget.title.iconClass = 'jp-ai-settings-icon';

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

      if (restorer) {
        restorer.add(settingsWidget, settingsWidget.id);
      }

      app.commands.addCommand(CommandIds.openSettings, {
        label: trans.__('AI Settings'),
        caption: trans.__('Configure AI providers and behavior'),
        icon: settingsIcon,
        iconClass: 'jp-ai-settings-icon',
        execute: () => {
          // Check if the widget already exists in shell
          let widget = Array.from(app.shell.widgets('main')).find(
            w => w.id === 'jupyterlite-ai-settings'
          ) as AISettingsWidget;

          if (!widget && settingsWidget) {
            // Use the pre-created widget
            widget = settingsWidget;
            app.shell.add(widget, 'main');
          }

          if (widget) {
            app.shell.activateById(widget.id);
          }
        },
        describedBy: {
          args: {}
        }
      });

      // Add to command palette if available
      if (palette) {
        palette.addItem({
          command: CommandIds.openSettings,
          category: trans.__('AI Assistant')
        });
      }

      return agentManagerFactory;
    }
  }));

/**
 * Built-in completion providers plugin
 */
const settingsModel: JupyterFrontEndPlugin<AISettingsModel> = {
  id: '@jupyterlite/ai:settings-model',
  description: 'Provide the AI settings model',
  autoStart: true,
  provides: IAISettingsModel,
  requires: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry) => {
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
    settingsModel: AISettingsModel
  ): IDiffManager => {
    return new DiffManager({
      commands: app.commands,
      settingsModel
    });
  }
};

const toolRegistry: JupyterFrontEndPlugin<IToolRegistry> = {
  id: '@jupyterlite/ai:tool-registry',
  description: 'Provide the AI tool registry',
  autoStart: true,
  requires: [IAISettingsModel, IDocumentManager, IKernelSpecManager],
  optional: [INotebookTracker, IDiffManager, IEditorTracker],
  provides: IToolRegistry,
  activate: (
    app: JupyterFrontEnd,
    settingsModel: AISettingsModel,
    docManager: IDocumentManager,
    kernelSpecManager: KernelSpec.IManager,
    notebookTracker?: INotebookTracker,
    diffManager?: IDiffManager,
    editorTracker?: IEditorTracker
  ) => {
    const toolRegistry = new ToolRegistry();

    const notebookCreationTool = createNotebookCreationTool(
      docManager,
      kernelSpecManager
    );
    toolRegistry.add('create_notebook', notebookCreationTool);

    // Add high-level notebook operation tools
    const addCellTool = createAddCellTool(docManager, notebookTracker);
    const getNotebookInfoTool = createGetNotebookInfoTool(
      docManager,
      notebookTracker
    );
    const getCellInfoTool = createGetCellInfoTool(docManager, notebookTracker);
    const setCellContentTool = createSetCellContentTool(
      docManager,
      notebookTracker,
      diffManager
    );
    const runCellTool = createRunCellTool(docManager, notebookTracker);
    const deleteCellTool = createDeleteCellTool(docManager, notebookTracker);
    const saveNotebookTool = createSaveNotebookTool(
      docManager,
      notebookTracker
    );
    const executeActiveCellTool = createExecuteActiveCellTool(
      docManager,
      notebookTracker
    );

    toolRegistry.add('add_cell', addCellTool);
    toolRegistry.add('get_notebook_info', getNotebookInfoTool);
    toolRegistry.add('get_cell_info', getCellInfoTool);
    toolRegistry.add('set_cell_content', setCellContentTool);
    toolRegistry.add('run_cell', runCellTool);
    toolRegistry.add('delete_cell', deleteCellTool);
    toolRegistry.add('save_notebook', saveNotebookTool);
    toolRegistry.add('execute_active_cell', executeActiveCellTool);

    // Add file operation tools
    const newFileTool = createNewFileTool(docManager);
    const openFileTool = createOpenFileTool(docManager);
    const deleteFileTool = createDeleteFileTool(docManager);
    const renameFileTool = createRenameFileTool(docManager);
    const copyFileTool = createCopyFileTool(docManager);
    const navigateToDirectoryTool = createNavigateToDirectoryTool(app.commands);
    const getFileInfoTool = createGetFileInfoTool(docManager, editorTracker);
    const setFileContentTool = createSetFileContentTool(
      docManager,
      diffManager
    );

    toolRegistry.add('create_file', newFileTool);
    toolRegistry.add('open_file', openFileTool);
    toolRegistry.add('delete_file', deleteFileTool);
    toolRegistry.add('rename_file', renameFileTool);
    toolRegistry.add('copy_file', copyFileTool);
    toolRegistry.add('navigate_to_directory', navigateToDirectoryTool);
    toolRegistry.add('get_file_info', getFileInfoTool);
    toolRegistry.add('set_file_content', setFileContentTool);

    // Add command operation tools
    const discoverCommandsTool = createDiscoverCommandsTool(app.commands);
    const executeCommandTool = createExecuteCommandTool(
      app.commands,
      settingsModel
    );

    toolRegistry.add('discover_commands', discoverCommandsTool);
    toolRegistry.add('execute_command', executeCommandTool);

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
    requires: [IAISettingsModel, IToolRegistry],
    optional: [ITranslator],
    activate: (
      app: JupyterFrontEnd,
      settingsModel: AISettingsModel,
      toolRegistry: IToolRegistry,
      translator?: ITranslator
    ): IInputToolbarRegistryFactory => {
      const trans = (translator ?? nullTranslator).load('jupyterlite_ai');
      const stopButton = stopItem(trans);
      const clearButton = clearItem(trans);
      const toolSelectButton = createToolSelectItem(
        toolRegistry,
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
    settingsModel: AISettingsModel,
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

export default [
  providerRegistryPlugin,
  anthropicProviderPlugin,
  googleProviderPlugin,
  mistralProviderPlugin,
  openaiProviderPlugin,
  genericProviderPlugin,
  settingsModel,
  diffManager,
  chatModelRegistry,
  plugin,
  toolRegistry,
  agentManagerFactory,
  inputToolbarFactory,
  completionStatus
];

// Export extension points for other extensions to use
export * from './tokens';
