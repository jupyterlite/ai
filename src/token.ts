import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';

import { IBaseCompleter } from './llm-models';

export interface IAIProvider {
  name: string;
  completer: IBaseCompleter | null;
  chatModel: BaseChatModel | null;
  providerChanged: ISignal<IAIProvider, void>;
  chatError: string;
  completerError: string;
}

export const IAIProvider = new Token<IAIProvider>(
  '@jupyterlite/ai:AIProvider',
  'Provider for chat and completion LLM provider'
);
