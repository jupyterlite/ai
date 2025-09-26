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
  IInputToolbarRegistryFactory,
  InputToolbarRegistry,
  MultiChatPanel
} from '@jupyter/chat';

import { ICommandPalette, IThemeManager } from '@jupyterlab/apputils';

import { ICompletionProviderManager } from '@jupyterlab/completer';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { INotebookTracker } from '@jupyterlab/notebook';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { IKernelSpecManager, KernelSpec } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { settingsIcon } from '@jupyterlab/ui-components';
import { ISecretsManager, SecretsManager } from 'jupyter-secrets-manager';

import { UUID } from '@lumino/coreutils';

import { AgentManagerFactory } from './agent';

import { AIChatModel } from './chat-model';

import {
  ChatProviderRegistry,
  CompletionProviderRegistry
} from './providers/provider-registry';

import {
  IAgentManagerFactory,
  IChatProviderRegistry,
  ICompletionProviderRegistry,
  IToolRegistry,
  SECRETS_NAMESPACE,
  IAISettingsModel
} from './tokens';

import {
  registerBuiltInChatProviders,
  registerBuiltInCompletionProviders
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

// import { ChatWrapperWidget } from './widgets/chat-wrapper';

/**
 * Command IDs namespace
 */
namespace CommandIds {
  export const openSettings = '@jupyterlite/ai:open-settings';
  export const reposition = '@jupyterlite/ai:reposition';
  export const openChat = '@jupyterlite/ai:open-chat';
}

/**
 * Chat provider registry plugin
 */
const chatProviderRegistryPlugin: JupyterFrontEndPlugin<IChatProviderRegistry> =
  {
    id: '@jupyterlite/ai:chat-provider-registry',
    description: 'Chat AI provider registry',
    autoStart: true,
    provides: IChatProviderRegistry,
    activate: () => {
      return new ChatProviderRegistry();
    }
  };

/**
 * Completion provider registry plugin
 */
const completionProviderRegistryPlugin: JupyterFrontEndPlugin<ICompletionProviderRegistry> =
  {
    id: '@jupyterlite/ai:completion-provider-registry',
    description: 'Completion provider registry',
    autoStart: true,
    provides: ICompletionProviderRegistry,
    activate: () => {
      return new CompletionProviderRegistry();
    }
  };

/**
 * Built-in chat providers plugin
 */
const builtInChatProvidersPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:built-in-chat-providers',
  description: 'Register built-in chat AI providers',
  autoStart: true,
  requires: [IChatProviderRegistry],
  activate: (app: JupyterFrontEnd, chatRegistry: IChatProviderRegistry) => {
    registerBuiltInChatProviders(chatRegistry);
  }
};

/**
 * Built-in completion providers plugin
 */
const builtInCompletionProvidersPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:built-in-completion-providers',
  description: 'Register built-in completion providers',
  autoStart: true,
  requires: [ICompletionProviderRegistry],
  activate: (
    app: JupyterFrontEnd,
    completionRegistry: ICompletionProviderRegistry
  ) => {
    registerBuiltInCompletionProviders(completionRegistry);
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
    IAISettingsModel,
    IToolRegistry,
    IRenderMimeRegistry,
    IDocumentManager,
    IChatProviderRegistry,
    IInputToolbarRegistryFactory,
    IAgentManagerFactory
  ],
  optional: [IThemeManager, INotebookTracker, ILayoutRestorer, ILabShell],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: AISettingsModel,
    toolRegistry: IToolRegistry,
    rmRegistry: IRenderMimeRegistry,
    docManager: IDocumentManager,
    chatProviderRegistry: IChatProviderRegistry,
    inputToolbarFactory: IInputToolbarRegistryFactory,
    agentManagerFactory: AgentManagerFactory,
    themeManager?: IThemeManager,
    notebookTracker?: INotebookTracker,
    restorer?: ILayoutRestorer,
    labShell?: ILabShell
  ): void => {
    // Create ActiveCellManager if notebook tracker is available
    let activeCellManager: ActiveCellManager | undefined;
    if (notebookTracker) {
      activeCellManager = new ActiveCellManager({
        tracker: notebookTracker,
        shell: app.shell
      });
    }

    // Create attachment opener registry to handle file attachments
    const attachmentOpenerRegistry = new AttachmentOpenerRegistry();
    attachmentOpenerRegistry.set('file', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    attachmentOpenerRegistry.set('notebook', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    const createModel = async (
      name?: string
    ): Promise<MultiChatPanel.IAddChatArgs> => {
      // Create Agent Manager first so it can be shared
      const agentManager = agentManagerFactory.createAgent({
        settingsModel,
        toolRegistry,
        chatProviderRegistry
      });

      console.log('AGENT MANAGER', agentManager);
      // Create AI chat model
      const model = new AIChatModel({
        user: { username: 'user', display_name: 'User' },
        settingsModel,
        agentManager,
        activeCellManager,
        documentManager: docManager
      });

      model.name = UUID.uuid4();
      return { model };
    };

    // Create chat panel with drag/drop functionality
    const chatPanel = new MultiChatPanel({
      rmRegistry,
      themeManager: themeManager ?? null,
      inputToolbarFactory,
      attachmentOpenerRegistry,
      createModel,
      getChatNames: async () => {
        return {};
      }
    });

    chatPanel.id = 'labai:sidepanel';
    chatPanel.title.icon = chatIcon;
    chatPanel.title.caption = 'Chat with AI assistant'; // TODO: i18n/

    chatPanel.sectionAdded.connect((_, section) => {
      const { model, widget } = section;
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

    if (restorer) {
      restorer.add(chatPanel, chatPanel.id);
    }

    registerCommands(app, labShell);
  }
};

function registerCommands(app: JupyterFrontEnd, labShell?: ILabShell) {
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
    requires: [IAISettingsModel, IChatProviderRegistry],
    optional: [
      ICommandPalette,
      ICompletionProviderManager,
      ICompletionProviderRegistry,
      ILayoutRestorer,
      ISecretsManager,
      IThemeManager,
      IToolRegistry
    ],
    activate: (
      app: JupyterFrontEnd,
      settingsModel: AISettingsModel,
      chatProviderRegistry: IChatProviderRegistry,
      palette: ICommandPalette,
      completionManager?: ICompletionProviderManager,
      completionProviderRegistry?: ICompletionProviderRegistry,
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
        chatProviderRegistry,
        secretsManager,
        token
      });
      settingsWidget.id = 'jupyterlite-ai-settings';
      settingsWidget.title.icon = settingsIcon;

      // Build the completion provider
      if (completionManager && completionProviderRegistry) {
        const completionProvider = new AICompletionProvider({
          settingsModel,
          completionProviderRegistry: completionProviderRegistry,
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
  chatProviderRegistryPlugin,
  completionProviderRegistryPlugin,
  builtInChatProvidersPlugin,
  builtInCompletionProvidersPlugin,
  settingsModel,
  plugin,
  toolRegistry,
  agentManagerFactory,
  inputToolbarFactory
];

// Export extension points for other extensions to use
export * from './tokens';
