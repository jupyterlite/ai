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

import { INotebookTracker } from '@jupyterlab/notebook';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { IKernelSpecManager, KernelSpec } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  settingsIcon,
  Toolbar,
  ToolbarButton
} from '@jupyterlab/ui-components';

import { ISecretsManager, SecretsManager } from 'jupyter-secrets-manager';

import { AgentManagerFactory } from './agent';

import { AIChatModel } from './chat-model';

import { ProviderRegistry } from './providers/provider-registry';

import {
  CommandIds,
  IAgentManagerFactory,
  IProviderRegistry,
  IToolRegistry,
  SECRETS_NAMESPACE,
  IAISettingsModel,
  IChatModelRegistry
} from './tokens';

import {
  anthropicProvider,
  googleProvider,
  mistralProvider,
  openaiProvider,
  ollamaProvider,
  genericProvider
} from './providers/built-in-providers';

import { AICompletionProvider } from './completion';

import { clearItem } from './components/clear-button';

import { createModelSelectItem } from './components/model-select';

import { stopItem } from './components/stop-button';

import { createToolSelectItem } from './components/tool-select';

import { AISettingsModel } from './models/settings-model';

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
  createNavigateToDirectoryTool,
  createNewFileTool,
  createOpenFileTool,
  createRenameFileTool
} from './tools/file';

import {
  createDiscoverCommandsTool,
  createExecuteCommandTool
} from './tools/commands';

import { AISettingsWidget } from './widgets/ai-settings';
import { MainAreaChat } from './widgets/main-area-chat';
import { ChatModelRegistry } from './chat-model-registry';
import { UUID } from '@lumino/coreutils';
import { TokenUsageWidget } from './components/token-usage-display';

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
 * Ollama provider plugin
 */
const ollamaProviderPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:ollama-provider',
  description: 'Register Ollama provider',
  autoStart: true,
  requires: [IProviderRegistry],
  activate: (app: JupyterFrontEnd, providerRegistry: IProviderRegistry) => {
    providerRegistry.registerProvider(ollamaProvider);
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
  optional: [IThemeManager, ILayoutRestorer, ILabShell],
  activate: (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
    inputToolbarFactory: IInputToolbarRegistryFactory,
    modelRegistry: IChatModelRegistry,
    settingsModel: AISettingsModel,
    themeManager?: IThemeManager,
    restorer?: ILayoutRestorer,
    labShell?: ILabShell
  ): void => {
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
      createModel: async (name?: string, activeProvider?: string) => {
        const model = modelRegistry.createModel(name, activeProvider);
        return { model };
      },
      renameChat: async (oldName: string, newName: string) => {
        const model = modelRegistry.get(oldName);
        if (model) {
          model.name = newName;
        }
        return true;
      },
      openInMain: (name: string) =>
        app.commands.execute(CommandIds.moveChat, { area: 'main', name })
    });

    chatPanel.id = 'labai:sidepanel';
    chatPanel.title.icon = chatIcon;
    chatPanel.title.caption = 'Chat with AI assistant'; // TODO: i18n/

    chatPanel.toolbar.addItem('spacer', Toolbar.createSpacerItem());
    chatPanel.toolbar.addItem(
      'settings',
      new ToolbarButton({
        icon: settingsIcon,
        onClick: () => {
          app.commands.execute('@jupyterlite/ai:open-settings');
        },
        tooltip: 'Open AI Settings'
      })
    );

    chatPanel.sectionAdded.connect((_, section) => {
      const { model, widget } = section;
      tracker.add(widget);
      const tokenUsageWidget = new TokenUsageWidget({
        tokenUsageChanged: (model as AIChatModel).tokenUsageChanged,
        settingsModel
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

    registerCommands(
      app,
      rmRegistry,
      chatPanel,
      attachmentOpenerRegistry,
      inputToolbarFactory,
      tracker,
      modelRegistry,
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
  tracker: WidgetTracker<MainAreaChat | ChatWidget>,
  modelRegistry: IChatModelRegistry,
  themeManager?: IThemeManager,
  labShell?: ILabShell
) {
  const { commands } = app;

  if (labShell) {
    commands.addCommand(CommandIds.reposition, {
      label: 'Reposition Widget',
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
              description:
                'The widget ID to reposition in the application shell'
            },
            area: {
              type: 'string',
              description: 'The name of the area to reposition the widget to'
            },
            mode: {
              type: 'string',
              enum: ['split-left', 'split-right', 'split-top', 'split-bottom'],
              description: 'The mode to use when repositioning the widget'
            }
          }
        }
      }
    });

    commands.addCommand(CommandIds.openChat, {
      execute: async args => {
        const area = (args.area as string) === 'main' ? 'main' : 'side';
        const provider = (args.provider as string) ?? undefined;
        const model = modelRegistry.createModel(
          args.name ? (args.name as string) : undefined,
          provider
        );
        if (!model) {
          return;
        }

        if (area === 'main') {
          const content = new ChatWidget({
            model,
            rmRegistry,
            themeManager: themeManager ?? null,
            inputToolbarRegistry: inputToolbarFactory.create(),
            attachmentOpenerRegistry
          });
          const widget = new MainAreaChat({ content, commands });
          app.shell.add(widget, 'main');
          tracker.add(widget);
        } else {
          chatPanel.addChat({ model });
        }
      }
    });

    commands.addCommand(CommandIds.moveChat, {
      execute: async args => {
        const area = args.area as string;
        if (!['side', 'main'].includes(area)) {
          console.error(
            'Error while moving the chat to main area: the area has not been provided or is not correct'
          );
          return;
        }
        if (!args.name || !args.area) {
          console.error(
            'Error while moving the chat to main area: the name has not been provided'
          );
          return;
        }
        const previousModel = modelRegistry.get(args.name as string);
        if (!previousModel) {
          console.error(
            'Error while moving the chat to main area: there is no reference model'
          );
          return;
        }
        previousModel.name = UUID.uuid4();
        const model = modelRegistry.createModel(
          args.name as string,
          previousModel?.agentManager.activeProvider
        );
        previousModel?.messages.forEach(message =>
          model?.messageAdded(message)
        );

        if (area === 'main') {
          const content = new ChatWidget({
            model,
            rmRegistry,
            themeManager: themeManager ?? null,
            inputToolbarRegistry: inputToolbarFactory.create(),
            attachmentOpenerRegistry
          });
          const widget = new MainAreaChat({ content, commands });
          app.shell.add(widget, 'main');

          tracker.add(widget);
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

        modelRegistry.remove(previousModel.name);
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
      IToolRegistry
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
      toolRegistry?: IToolRegistry
    ): AgentManagerFactory => {
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
        token
      });
      settingsWidget.id = 'jupyterlite-ai-settings';
      settingsWidget.title.icon = settingsIcon;

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
        label: 'AI Settings',
        caption: 'Configure AI providers and behavior',
        icon: settingsIcon,
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
          category: 'AI Assistant'
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

const toolRegistry: JupyterFrontEndPlugin<IToolRegistry> = {
  id: '@jupyterlite/ai:tool-registry',
  description: 'Provide the AI tool registry',
  autoStart: true,
  requires: [IAISettingsModel, IDocumentManager, IKernelSpecManager],
  optional: [INotebookTracker],
  provides: IToolRegistry,
  activate: (
    app: JupyterFrontEnd,
    settingsModel: AISettingsModel,
    docManager: IDocumentManager,
    kernelSpecManager: KernelSpec.IManager,
    notebookTracker?: INotebookTracker
  ) => {
    const { commands } = app;
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
      commands,
      notebookTracker
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

    toolRegistry.add('create_file', newFileTool);
    toolRegistry.add('open_file', openFileTool);
    toolRegistry.add('delete_file', deleteFileTool);
    toolRegistry.add('rename_file', renameFileTool);
    toolRegistry.add('copy_file', copyFileTool);
    toolRegistry.add('navigate_to_directory', navigateToDirectoryTool);

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
    id: 'labai:input-toolbar-factory',
    description: 'The input toolbar registry plugin.',
    autoStart: true,
    provides: IInputToolbarRegistryFactory,
    requires: [IAISettingsModel, IToolRegistry],
    activate: (
      app: JupyterFrontEnd,
      settingsModel: AISettingsModel,
      toolRegistry: IToolRegistry
    ): IInputToolbarRegistryFactory => {
      const stopButton = stopItem();
      const clearButton = clearItem();
      const toolSelectButton = createToolSelectItem(
        toolRegistry,
        settingsModel.config.toolsEnabled
      );
      const modelSelectButton = createModelSelectItem(settingsModel);

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
  providerRegistryPlugin,
  anthropicProviderPlugin,
  googleProviderPlugin,
  mistralProviderPlugin,
  openaiProviderPlugin,
  ollamaProviderPlugin,
  genericProviderPlugin,
  settingsModel,
  chatModelRegistry,
  plugin,
  toolRegistry,
  agentManagerFactory,
  inputToolbarFactory
];

// Export extension points for other extensions to use
export * from './tokens';
