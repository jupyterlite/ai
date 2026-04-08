import { ActiveCellManager } from '@jupyter/chat';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { AIChatModel } from './chat-model';
import type {
  IAgentManagerFactory,
  IAISettingsModel,
  IChatModelHandler,
  IProviderRegistry,
  ITokenUsage,
  IToolRegistry
} from './tokens';

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
      documentManager: this._docManager
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
  private _agentManagerFactory: IAgentManagerFactory;
  private _settingsModel: IAISettingsModel;
  private _toolRegistry?: IToolRegistry;
  private _providerRegistry?: IProviderRegistry;
  private _rmRegistry: IRenderMimeRegistry;
  private _activeCellManager?: ActiveCellManager;
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
  }
}
