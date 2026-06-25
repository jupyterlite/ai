import type { IChatModel } from '@jupyter/chat';

import { ISignal, Signal } from '@lumino/signaling';

import type { IPersona, IPersonaRegistry } from './tokens';

export class PersonaRegistry implements IPersonaRegistry {
  get(model: IChatModel): IPersona | undefined {
    return this._personas.get(model);
  }

  register(model: IChatModel, persona: IPersona): void {
    this._personas.set(model, persona);
    this._personaAdded.emit(persona);
  }

  unregister(model: IChatModel): void {
    this._personas.delete(model);
  }

  get personaAdded(): ISignal<IPersonaRegistry, IPersona> {
    return this._personaAdded;
  }

  private _personas = new Map<IChatModel, IPersona>();
  private _personaAdded = new Signal<IPersonaRegistry, IPersona>(this);
}
