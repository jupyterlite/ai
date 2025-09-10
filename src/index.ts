import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  ActiveCellManager,
  AttachmentOpenerRegistry,
  ChatWidget,
  InputToolbarRegistry
} from '@jupyter/chat';

import { ICommandPalette, IThemeManager } from '@jupyterlab/apputils';

import { ICompletionProviderManager } from '@jupyterlab/completer';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { INotebookTracker } from '@jupyterlab/notebook';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { IKernelSpecManager, KernelSpec } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { settingsIcon } from '@jupyterlab/ui-components';

import { AgentManager } from './agent';
import { AIChatModel } from './chat-model';

import {
  ChatProviderRegistry,
  CompletionProviderRegistry
} from './providers/provider-registry';

import {
  IChatProviderRegistry,
  ICompletionProviderRegistry,
  ILabAISettingsModel
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

import { ChatWrapperWidget } from './widgets/chat-wrapper';

/**
 * Command IDs namespace
 */
namespace CommandIds {
  export const openSettings = 'labai:open-settings';
  export const reposition = 'labai:reposition';
}

/**
 * Chat provider registry plugin
 */
const chatProviderRegistryPlugin: JupyterFrontEndPlugin<IChatProviderRegistry> =
  {
    id: 'labai:chat-provider-registry',
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
    id: 'labai:completion-provider-registry',
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
  id: 'labai:built-in-chat-providers',
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
  id: 'labai:built-in-completion-providers',
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
 * Initialization data for the labai extension.
 */
const plugin: JupyterFrontEndPlugin<AISettingsModel> = {
  id: 'labai:plugin',
  description: 'AI in JupyterLab',
  autoStart: true,
  provides: ILabAISettingsModel,
  requires: [
    IRenderMimeRegistry,
    IDocumentManager,
    IKernelSpecManager,
    IChatProviderRegistry,
    ISettingRegistry
  ],
  optional: [
    IThemeManager,
    ICommandPalette,
    INotebookTracker,
    ILayoutRestorer,
    ILabShell
  ],
  activate: (
    app: JupyterFrontEnd,
    rmRegistry: IRenderMimeRegistry,
    docManager: IDocumentManager,
    kernelSpecManager: KernelSpec.IManager,
    chatProviderRegistry: IChatProviderRegistry,
    settingRegistry: ISettingRegistry,
    themeManager?: IThemeManager,
    palette?: ICommandPalette,
    notebookTracker?: INotebookTracker,
    restorer?: ILayoutRestorer,
    labShell?: ILabShell
  ): AISettingsModel => {
    const settingsModel = new AISettingsModel({ settingRegistry });
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

    // Create ActiveCellManager if notebook tracker is available
    let activeCellManager: ActiveCellManager | undefined;
    if (notebookTracker) {
      activeCellManager = new ActiveCellManager({
        tracker: notebookTracker,
        shell: app.shell
      });
    }

    // Create Agent Manager first so it can be shared
    const agentManager = new AgentManager({
      settingsModel,
      toolRegistry,
      chatProviderRegistry: chatProviderRegistry
    });

    // Create AI chat model
    const chatModel = new AIChatModel({
      user: { username: 'user', display_name: 'User' },
      settingsModel,
      agentManager,
      activeCellManager,
      documentManager: docManager
    });

    // Create input toolbar registry with all buttons
    const inputToolbarRegistry = InputToolbarRegistry.defaultToolbarRegistry();
    const stopButton = stopItem(() => chatModel.stopStreaming());
    const clearButton = clearItem(() => chatModel.clearMessages());
    const toolSelectButton = createToolSelectItem(
      toolRegistry,
      tools => {
        agentManager.setSelectedTools(tools);
      },
      settingsModel.config.toolsEnabled
    );
    const modelSelectButton = createModelSelectItem(settingsModel);

    inputToolbarRegistry.addItem('stop', stopButton);
    inputToolbarRegistry.addItem('clear', clearButton);
    inputToolbarRegistry.addItem('model', modelSelectButton);
    inputToolbarRegistry.addItem('tools', toolSelectButton);

    // Listen to writers changes to show/hide stop button
    chatModel.writersChanged.connect((_, writers) => {
      // Check if AI is currently writing (streaming)
      const aiWriting = writers.some(
        writer => writer.user.username === 'ai-assistant'
      );

      if (aiWriting) {
        inputToolbarRegistry.hide('send');
        inputToolbarRegistry.show('stop');
      } else {
        inputToolbarRegistry.hide('stop');
        inputToolbarRegistry.show('send');
      }
    });

    // Listen for settings changes to update tool availability
    settingsModel.stateChanged.connect(() => {
      const config = settingsModel.config;
      if (!config.toolsEnabled) {
        inputToolbarRegistry.hide('tools');
      } else {
        inputToolbarRegistry.show('tools');
      }
    });

    // Create attachment opener registry to handle file attachments
    const attachmentOpenerRegistry = new AttachmentOpenerRegistry();
    attachmentOpenerRegistry.set('file', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    attachmentOpenerRegistry.set('notebook', attachment => {
      app.commands.execute('docmanager:open', { path: attachment.value });
    });

    // Create chat panel with drag/drop functionality
    const chatPanel = new ChatWidget({
      model: chatModel,
      rmRegistry,
      themeManager,
      inputToolbarRegistry,
      attachmentOpenerRegistry
    });

    // Create wrapper widget with a toolbar
    const chatWrapper = new ChatWrapperWidget({
      chatPanel,
      commands: app.commands,
      chatModel,
      settingsModel
    });

    app.shell.add(chatWrapper, 'left', { rank: 1000 });

    const settingsWidget = new AISettingsWidget({
      settingsModel,
      agentManager,
      themeManager,
      chatProviderRegistry
    });
    settingsWidget.id = 'labai-settings';
    settingsWidget.title.icon = settingsIcon;

    if (restorer) {
      restorer.add(chatWrapper, chatWrapper.id);
      restorer.add(settingsWidget, settingsWidget.id);
    }

    registerCommands(app, palette, settingsWidget, labShell);

    return settingsModel;
  }
};

function registerCommands(
  app: JupyterFrontEnd,
  palette?: ICommandPalette,
  settingsWidget?: AISettingsWidget,
  labShell?: ILabShell
) {
  const { commands } = app;

  commands.addCommand(CommandIds.openSettings, {
    label: 'AI Settings',
    caption: 'Configure AI providers and behavior',
    icon: settingsIcon,
    execute: () => {
      // Check if the widget already exists in shell
      let widget = Array.from(app.shell.widgets('main')).find(
        w => w.id === 'labai-settings'
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

  // Add to command palette if available
  if (palette) {
    palette.addItem({
      command: CommandIds.openSettings,
      category: 'AI Assistant'
    });
  }
}

/**
 * A plugin to provide AI-powered code completion.
 */
const completionPlugin: JupyterFrontEndPlugin<void> = {
  id: 'labai:completion',
  description: 'AI-powered code completion',
  autoStart: true,
  requires: [ILabAISettingsModel, ICompletionProviderRegistry],
  optional: [ICompletionProviderManager],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: AISettingsModel,
    completionProviderRegistry: ICompletionProviderRegistry,
    manager?: ICompletionProviderManager
  ) => {
    if (!manager) {
      console.info(
        'Completion provider manager not available, skipping AI completion setup'
      );
      return;
    }

    const completionProvider = new AICompletionProvider({
      settingsModel,
      completionProviderRegistry: completionProviderRegistry
    });

    manager.registerInlineProvider(completionProvider);
  }
};

export default [
  chatProviderRegistryPlugin,
  completionProviderRegistryPlugin,
  builtInChatProvidersPlugin,
  builtInCompletionProvidersPlugin,
  plugin,
  completionPlugin
];

// Export extension points for other extensions to use
export * from './tokens';
