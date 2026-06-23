import type { IChatModel } from '@jupyter/chat';

import { Signal } from '@lumino/signaling';

import type { PersonaHandler } from './persona-handler';

import type { IPersonaHandlerRegistry } from './tokens';

export class PersonaHandlerRegistry implements IPersonaHandlerRegistry {
  get(model: IChatModel): PersonaHandler | undefined {
    return this._handlers.get(model);
  }

  register(model: IChatModel, handler: PersonaHandler): void {
    this._handlers.set(model, handler);
    this._handlerAdded.emit(handler);
  }

  unregister(model: IChatModel): void {
    this._handlers.delete(model);
  }

  get handlerAdded(): Signal<IPersonaHandlerRegistry, PersonaHandler> {
    return this._handlerAdded;
  }

  private _handlers = new Map<IChatModel, PersonaHandler>();
  private _handlerAdded = new Signal<IPersonaHandlerRegistry, PersonaHandler>(
    this
  );
}
