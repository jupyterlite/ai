import type { IChatModel } from '@jupyter/chat';

import { IAgentManager } from '@jupyternaut/agent';

import { ISignal, Signal } from '@lumino/signaling';

import { Persona } from './persona';

import type {
  IPersona,
  IPersonaRegistry,
  IPersonaRegistryOptions
} from './tokens';

export class PersonaRegistry implements IPersonaRegistry {
  constructor(options: IPersonaRegistryOptions) {
    this._options = options;
  }

  get(model: IChatModel): IPersona | undefined {
    return this._personas.get(model);
  }

  register(model: IChatModel, agentManager: IAgentManager): void {
    const persona = new Persona({
      model,
      agentManager,
      ...this._options
    });
    this._personas.set(model, persona);
    this._personaAdded.emit(persona);
  }

  unregister(model: IChatModel): void {
    this.get(model)?.dispose();
    this._personas.delete(model);
  }

  get personaAdded(): ISignal<IPersonaRegistry, IPersona> {
    return this._personaAdded;
  }

  private _options: IPersonaRegistryOptions;
  private _personas = new Map<IChatModel, IPersona>();
  private _personaAdded = new Signal<IPersonaRegistry, IPersona>(this);
}
