import { ActiveCellManager } from '@jupyter/chat';
import { AgentManagerFactory } from './agent';
import { AIChatModel } from './chat-model';
import { AISettingsModel } from './models/settings-model';
import {
  IChatModelRegistry,
  IProviderRegistry,
  ITokenUsage,
  IToolRegistry
} from './tokens';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { UUID } from '@lumino/coreutils';

/**
 * The chat model registry.
 */
export class ChatModelRegistry implements IChatModelRegistry {
  constructor(options: ChatModelRegistry.IOptions) {
    this._docManager = options.docManager;
    this._agentManagerFactory = options.agentManagerFactory;
    this._settingsModel = options.settingsModel;
    this._toolRegistry = options.toolRegistry;
    this._providerRegistry = options.providerRegistry;
    this._activeCellManager = options.activeCellManager;
  }

  createModel(
    name?: string,
    activeProvider?: string,
    tokenUsage?: ITokenUsage
  ): AIChatModel {
    // Create Agent Manager first so it can be shared
    const agentManager = this._agentManagerFactory.createAgent({
      settingsModel: this._settingsModel,
      toolRegistry: this._toolRegistry,
      providerRegistry: this._providerRegistry,
      activeProvider,
      tokenUsage
    });

    // Create AI chat model
    const model = new AIChatModel({
      user: { username: 'user', display_name: 'User' },
      settingsModel: this._settingsModel,
      agentManager,
      activeCellManager: this._activeCellManager,
      documentManager: this._docManager
    });

    // Set the name of the chat if not provided.
    // The name will be the name set by the user to the model if not already used by
    // another chat.
    if (!name || this._models.findIndex(m => m.name === name) !== -1) {
      const existingName = this.getAll().map(model => model.name);

      const modelName =
        this._settingsModel.getProvider(agentManager.activeProvider)?.name ||
        UUID.uuid4();
      name = modelName;
      let i = 1;
      while (existingName.includes(name)) {
        name = `${modelName}-${i}`;
        i += 1;
      }
    }
    model.name = name;
    this.add(model);

    return model;
  }

  add(model: AIChatModel): void {
    if (!this._models.find(m => m.name === model.name)) {
      this._models.push(model);
    }
  }

  get(name: string): AIChatModel | undefined {
    return this._models.find(m => m.name === name);
  }

  getAll(): AIChatModel[] {
    return this._models;
  }

  remove(name: string): void {
    const index = this._models.findIndex(m => m.name === name);
    if (index !== -1) {
      this._models.splice(index, 1);
    }
  }

  private _models: AIChatModel[] = [];
  private _docManager: IDocumentManager;
  private _agentManagerFactory: AgentManagerFactory;
  private _settingsModel: AISettingsModel;
  private _toolRegistry?: IToolRegistry;
  private _providerRegistry?: IProviderRegistry;
  private _activeCellManager?: ActiveCellManager;
}

export namespace ChatModelRegistry {
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
     * The active cell manager.
     */
    activeCellManager: ActiveCellManager | undefined;
  }
}
