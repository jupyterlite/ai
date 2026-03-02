import { ActiveCellManager } from '@jupyter/chat';
import { TranslationBundle } from '@jupyterlab/translation';
import { AgentManagerFactory } from './agent';
import { AIChatModel } from './chat-model';
import { AISettingsModel } from './models/settings-model';
import {
  IChatModelHandler,
  IProviderRegistry,
  ITokenUsage,
  IToolRegistry
} from './tokens';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

/**
 * The chat model handler.
 */
export class ChatModelHandler implements IChatModelHandler {
  constructor(options: ChatModelHandler.IOptions) {
    this._docManager = options.docManager;
    this._agentManagerFactory = options.agentManagerFactory;
    this._settingsModel = options.settingsModel;
    this._toolRegistry = options.toolRegistry;
    this._providerRegistry = options.providerRegistry;
    this._rmRegistry = options.rmRegistry;
    this._activeCellManager = options.activeCellManager;
    this._trans = options.trans;
  }

  createModel(
    name: string,
    activeProvider: string,
    tokenUsage?: ITokenUsage
  ): AIChatModel {
    // Create Agent Manager first so it can be shared
    const agentManager = this._agentManagerFactory.createAgent({
      settingsModel: this._settingsModel,
      toolRegistry: this._toolRegistry,
      providerRegistry: this._providerRegistry,
      activeProvider,
      tokenUsage,
      renderMimeRegistry: this._rmRegistry
    });

    // Create AI chat model
    const model = new AIChatModel({
      user: { username: 'user', display_name: 'User' },
      settingsModel: this._settingsModel,
      agentManager,
      activeCellManager: this._activeCellManager,
      documentManager: this._docManager,
      trans: this._trans
    });

    model.name = name;

    return model;
  }

  /**
   * Getter/setter for the active cell manager.
   */
  get activeCellManager(): ActiveCellManager | undefined {
    return this._activeCellManager;
  }
  set activeCellManager(manager: ActiveCellManager | undefined) {
    this._activeCellManager = manager;
  }

  private _docManager: IDocumentManager;
  private _agentManagerFactory: AgentManagerFactory;
  private _settingsModel: AISettingsModel;
  private _toolRegistry?: IToolRegistry;
  private _providerRegistry?: IProviderRegistry;
  private _rmRegistry: IRenderMimeRegistry;
  private _activeCellManager?: ActiveCellManager;
  private _trans: TranslationBundle;
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
    agentManagerFactory: AgentManagerFactory;
    /**
     * AI settings model for configuration
     */
    settingsModel: AISettingsModel;
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
     * The application language translation bundle.
     */
    trans: TranslationBundle;
  }
}
