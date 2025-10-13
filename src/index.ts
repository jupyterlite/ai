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
import { ISecretsManager, SecretsManager } from 'jupyter-secrets-manager';

import { AgentManager } from './agent';
import { AIChatModel } from './chat-model';

import { ProviderRegistry } from './providers/provider-registry';

import {
  IAgentManager,
  IProviderRegistry,
  IToolRegistry,
  SECRETS_NAMESPACE,
  IAISettingsModel
} from './tokens';

import {
  anthropicProvider,
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

import { ChatWrapperWidget } from './widgets/chat-wrapper';

/**
 * Command IDs namespace
 */
namespace CommandIds {
  export const openSettings = '@jupyterlite/ai:open-settings';
  export const reposition = '@jupyterlite/ai:reposition';
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
 * Initialization data for the extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/ai:plugin',
  description: 'AI in JupyterLab',
  autoStart: true,
  requires: [
    IAISettingsModel,
    IAgentManager,
    IToolRegistry,
    IRenderMimeRegistry,
    IDocumentManager
  ],
  optional: [IThemeManager, INotebookTracker, ILayoutRestorer, ILabShell],
  activate: (
    app: JupyterFrontEnd,
    settingsModel: AISettingsModel,
    agentManager: AgentManager,
    toolRegistry: IToolRegistry,
    rmRegistry: IRenderMimeRegistry,
    docManager: IDocumentManager,
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
    const stopButton = stopItem();
    const clearButton = clearItem();
    const toolSelectButton = createToolSelectItem(
      toolRegistry,
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

    if (restorer) {
      restorer.add(chatWrapper, chatWrapper.id);
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
const agentManager: JupyterFrontEndPlugin<AgentManager> = SecretsManager.sign(
  SECRETS_NAMESPACE,
  token => ({
    id: SECRETS_NAMESPACE,
    description: 'Provide the AI agent manager',
    autoStart: true,
    provides: IAgentManager,
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
    ): AgentManager => {
      // Build the agent manager
      const agentManager = new AgentManager({
        settingsModel,
        toolRegistry,
        providerRegistry,
        secretsManager,
        token
      });

      // Build the settings panel
      const settingsWidget = new AISettingsWidget({
        settingsModel,
        agentManager,
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

      return agentManager;
    }
  })
);

/**
 * A plugin to provide the settings model.
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
 * A plugin to provide the tool registry.
 */
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

export default [
  providerRegistryPlugin,
  anthropicProviderPlugin,
  mistralProviderPlugin,
  openaiProviderPlugin,
  ollamaProviderPlugin,
  genericProviderPlugin,
  plugin,
  settingsModel,
  agentManager,
  toolRegistry
];

// Export extension points for other extensions to use
export * from './tokens';
