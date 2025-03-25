/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  ChatCommand,
  ChatModel,
  IChatCommandProvider,
  IChatHistory,
  IChatMessage,
  IInputModel,
  INewMessage
} from '@jupyter/chat';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  HumanMessage,
  mergeMessageRuns,
  SystemMessage
} from '@langchain/core/messages';
import { UUID } from '@lumino/coreutils';
import { chatSystemPrompt } from './provider';
import { IAIProviderRegistry } from './tokens';
import { jupyternautLiteIcon } from './icons';

/**
 * The base64 encoded SVG string of the jupyternaut lite icon.
 * Encode so it can be passed as avatar_url to jupyter-chat.
 */
const AI_AVATAR_BASE64 = btoa(jupyternautLiteIcon.svgstr);
const AI_AVATAR = `data:image/svg+xml;base64,${AI_AVATAR_BASE64}`;

export type ConnectionMessage = {
  type: 'connection';
  client_id: string;
};

export class ChatHandler extends ChatModel {
  constructor(options: ChatHandler.IOptions) {
    super(options);
    this._providerRegistry = options.providerRegistry;
    this._prompt = chatSystemPrompt({
      provider_name: this._providerRegistry.currentName
    });

    this._providerRegistry.providerChanged.connect(() => {
      this._errorMessage = this._providerRegistry.chatError;
      this._prompt = chatSystemPrompt({
        provider_name: this._providerRegistry.currentName
      });
    });
  }

  get provider(): BaseChatModel | null {
    return this._providerRegistry.currentChatModel;
  }

  /**
   * Getter and setter for the persona name.
   */
  get personaName(): string {
    return this._personaName;
  }
  set personaName(value: string) {
    this.messages.forEach(message => {
      if (message.sender.username === this._personaName) {
        const updated: IChatMessage = { ...message };
        updated.sender.username = value;
        this.messageAdded(updated);
      }
    });
    this._personaName = value;
  }

  /**
   * Getter and setter for the initial prompt.
   */
  get prompt(): string {
    return this._prompt;
  }
  set prompt(value: string) {
    this._prompt = value;
  }

  async sendMessage(message: INewMessage): Promise<boolean> {
    const body = message.body;
    if (body.startsWith('/clear')) {
      // TODO: do we need a clear method?
      this.messagesDeleted(0, this.messages.length);
      this._history.messages = [];
      return false;
    }
    message.id = UUID.uuid4();
    const msg: IChatMessage = {
      id: message.id,
      body,
      sender: { username: 'User' },
      time: Date.now(),
      type: 'msg'
    };
    this.messageAdded(msg);

    if (this._providerRegistry.currentChatModel === null) {
      const errorMsg: IChatMessage = {
        id: UUID.uuid4(),
        body: `**${this._errorMessage ? this._errorMessage : this._defaultErrorMessage}**`,
        sender: { username: 'ERROR' },
        time: Date.now(),
        type: 'msg'
      };
      this.messageAdded(errorMsg);
      return false;
    }

    this._history.messages.push(msg);

    const messages = mergeMessageRuns([new SystemMessage(this._prompt)]);
    messages.push(
      ...this._history.messages.map(msg => {
        if (msg.sender.username === 'User') {
          return new HumanMessage(msg.body);
        }
        return new AIMessage(msg.body);
      })
    );

    const sender = { username: this._personaName, avatar_url: AI_AVATAR };
    this.updateWriters([sender]);

    // create an empty message to be filled by the AI provider
    const botMsg: IChatMessage = {
      id: UUID.uuid4(),
      body: '',
      sender,
      time: Date.now(),
      type: 'msg'
    };

    let content = '';

    this._controller = new AbortController();
    try {
      for await (const chunk of await this._providerRegistry.currentChatModel.stream(
        messages,
        { signal: this._controller.signal }
      )) {
        content += chunk.content ?? chunk;
        botMsg.body = content;
        this.messageAdded(botMsg);
      }
      this._history.messages.push(botMsg);
      return true;
    } catch (reason) {
      const error = this._providerRegistry.formatErrorMessage(reason);
      const errorMsg: IChatMessage = {
        id: UUID.uuid4(),
        body: `**${error}**`,
        sender: { username: 'ERROR' },
        time: Date.now(),
        type: 'msg'
      };
      this.messageAdded(errorMsg);
      return false;
    } finally {
      this.updateWriters([]);
      this._controller = null;
    }
  }

  async getHistory(): Promise<IChatHistory> {
    return this._history;
  }

  dispose(): void {
    super.dispose();
  }

  messageAdded(message: IChatMessage): void {
    super.messageAdded(message);
  }

  stopStreaming(): void {
    this._controller?.abort();
  }

  private _providerRegistry: IAIProviderRegistry;
  private _personaName = 'AI';
  private _prompt: string;
  private _errorMessage: string = '';
  private _history: IChatHistory = { messages: [] };
  private _defaultErrorMessage = 'AI provider not configured';
  private _controller: AbortController | null = null;
}

export namespace ChatHandler {
  export interface IOptions extends ChatModel.IOptions {
    providerRegistry: IAIProviderRegistry;
  }

  export class ClearCommandProvider implements IChatCommandProvider {
    public id: string = '@jupyterlite/ai:clear-commands';
    private _slash_commands: ChatCommand[] = [
      {
        name: '/clear',
        providerId: this.id,
        replaceWith: '/clear',
        description: 'Clear the chat'
      }
    ];
    async getChatCommands(inputModel: IInputModel) {
      const match = inputModel.currentWord?.match(/^\/\w*/)?.[0];
      if (!match) {
        return [];
      }

      const commands = this._slash_commands.filter(cmd =>
        cmd.name.startsWith(match)
      );
      return commands;
    }

    async handleChatCommand(
      command: ChatCommand,
      inputModel: IInputModel
    ): Promise<void> {
      // no handling needed because `replaceWith` is set in each command.
      return;
    }
  }
}
