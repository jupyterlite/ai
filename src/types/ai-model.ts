/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  CompletionHandler,
  IInlineCompletionContext
} from '@jupyterlab/completer';
import { IterableReadableStream } from '@langchain/core/utils/stream';

/**
 * The reduced AI chat model interface.
 */
export type AIChatModel = {
  /**
   * The stream function of the chat model.
   */
  stream: (input: any, options?: any) => Promise<IterableReadableStream<any>>;
};

/**
 * The reduced AI completer interface.
 */
export type AICompleter = {
  /**
   * The fetch function of the completer.
   */
  fetch: (
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext
  ) => Promise<any>;
  /**
   * The optional request completion function of the completer.
   */
  requestCompletion?: () => void;
};
