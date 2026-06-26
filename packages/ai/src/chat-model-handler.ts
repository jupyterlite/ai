import { ActiveCellManager } from '@jupyter/chat';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Contents } from '@jupyterlab/services';
import type {
  IAgentManagerFactory,
  IAISettingsModel,
  IProviderRegistry,
  IToolRegistry
} from '@jupyternaut/agent';
import { IPersonaRegistry } from '@jupyternaut/persona';

import { AIChatModel } from './chat-model';
import type {
  IAIChatModel,
  IChatModelHandler,
  ICreateChatOptions
} from './tokens';

/**
 * The chat model handler.
 */
export class ChatModelHandler implements IChatModelHandler {
  constructor(options: ChatModelHandler.IOptions) {
    this._options = options;
  }

  createModel(options: ICreateChatOptions): IAIChatModel {
    const { name, activeProvider, tokenUsage, messages, autosave, title } =
      options;

    // Create Agent Manager first so it can be shared
    const agentManager = this._options.agentManagerFactory.createAgent({
      settingsModel: this._options.settingsModel,
      toolRegistry: this._options.toolRegistry,
      providerRegistry: this._options.providerRegistry,
      activeProvider,
      tokenUsage,
      renderMimeRegistry: this._options.rmRegistry
    });

    // Create AI chat model
    const model = new AIChatModel({
      user: { username: 'user', display_name: 'User' },
      settingsModel: this._options.settingsModel,
      personaRegistry: this._options.personaRegistry,
      settings: this._options.chatSettings ?? undefined,
      activeProvider,
      activeCellManager: this._options.activeCellManager,
      documentManager: this._options.docManager,
      contentsManager: this._options.contentsManager
    });

    messages?.forEach(message => {
      model.messageAdded({ ...message.content });
    });
    model.autosave = autosave ?? false;

    model.name = name;

    if (title) {
      model.title = title;
    }

    this._options.personaRegistry?.register(model, agentManager);
    return model;
  }

  /**
   * Getter/setter for the active cell manager.
   */
  get activeCellManager(): ActiveCellManager | undefined {
    return this._options.activeCellManager;
  }
  set activeCellManager(manager: ActiveCellManager | undefined) {
    this._options.activeCellManager = manager;
  }

  private _options: ChatModelHandler.IOptions;
}

export namespace ChatModelHandler {
  export interface IOptions {
    /**
     * The document manager.
     */
    docManager: IDocumentManager;
    /**
     * The agent manager factory.
     */
    agentManagerFactory: IAgentManagerFactory;
    /**
     * AI settings model for configuration
     */
    settingsModel: IAISettingsModel;
    /**
     * Registry to attach an agent to the chat model.
     */
    personaRegistry: IPersonaRegistry;
    /**
     * Optional chat-specific settings from JupyterLab setting registry.
     */
    chatSettings?: ISettingRegistry.ISettings;
    /**
     * Optional tool registry for managing available tools
     */
    toolRegistry?: IToolRegistry;
    /**
     * Optional provider registry for model creation
     */
    providerRegistry?: IProviderRegistry;
    /**
     * Render mime registry.
     */
    rmRegistry: IRenderMimeRegistry;
    /**
     * The active cell manager.
     */
    activeCellManager?: ActiveCellManager | undefined;
    /**
     * The contents manager.
     */
    contentsManager?: Contents.IManager;
  }
}
