import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';

import { IBaseCompleter } from './llm-models';

export interface IType<T> {
  new (...args: any[]): T;
}

export interface IAIProvider {
  name: string;
  chatModel?: IType<BaseChatModel>;
  completer?: IType<IBaseCompleter>;
  settings?: any;
  instructions?: string;
  errorMessage?: (error: any) => string;
}

export interface IAIProviderRegistry {
  readonly providers: string[];
  add(name: string, provider: IAIProvider): void;
  remove(name: string): void;
  name: string;
  completer: IBaseCompleter | null;
  chatModel: BaseChatModel | null;
  formatErrorMessage(error: any): string;
  providerChanged: ISignal<IAIProviderRegistry, void>;
  chatError: string;
  completerError: string;
}

export const IAIProviderRegistry = new Token<IAIProviderRegistry>(
  '@jupyterlite/ai:AIProvider',
  'Provider for chat and completion LLM provider'
);
