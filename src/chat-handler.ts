/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  ChatCommand,
  AbstractChatContext,
  AbstractChatModel,
  IChatCommandProvider,
  IChatContext,
  IChatMessage,
  IChatModel,
  IInputModel,
  INewMessage,
  IUser
} from '@jupyter/chat';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  mergeMessageRuns,
  SystemMessage
} from '@langchain/core/messages';
import { UUID } from '@lumino/coreutils';

import { DEFAULT_CHAT_SYSTEM_PROMPT } from './default-prompts';
import { jupyternautLiteIcon } from './icons';
import { IAIProviderRegistry, IToolRegistry } from './tokens';
import { AIChatModel } from './types/ai-model';

/**
 * The base64 encoded SVG string of the jupyternaut lite icon.
 * Encode so it can be passed as avatar_url to jupyter-chat.
 */
const AI_AVATAR_BASE64 = btoa(jupyternautLiteIcon.svgstr);
const AI_AVATAR = `data:image/svg+xml;base64,${AI_AVATAR_BASE64}`;

export const welcomeMessage = (providers: string[]) => `
#### Ask JupyterLite AI


The provider to use can be set in the <button data-commandLinker-command="settingeditor:open" data-commandLinker-args='{"query": "AI provider"}' href="#">settings editor</button>, by selecting it from
the <img src="${AI_AVATAR}" width="16" height="16"> _AI provider_ settings.

The current providers that are available are _${providers.sort().join('_, _')}_.

To clear the chat, you can use the \`/clear\` command from the chat input.
`;

export class ChatHandler extends AbstractChatModel {
  constructor(options: ChatHandler.IOptions) {
    super(options);
    this._providerRegistry = options.providerRegistry;
    this._toolRegistry = options.toolRegistry;

    this._providerRegistry.providerChanged.connect(() => {
      this._errorMessage = this._providerRegistry.chatError;
    });
  }

  clearMessages(): void {
    super.clearMessages();
    this._history = [];
  }

  /**
   * The provider registry.
   */
  get providerRegistry(): IAIProviderRegistry {
    return this._providerRegistry;
  }

  /**
   * Get the tool registry.
   */
  get toolRegistry(): IToolRegistry | undefined {
    return this._toolRegistry;
  }

  /**
   * Get the agent from the provider registry.
   */
  get agent(): AIChatModel | null {
    return this._providerRegistry.currentAgent;
  }

  /**
   * Get the chat model from the provider registry.
   */
  get chatModel(): AIChatModel | null {
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
   * Get the system prompt for the chat.
   */
  get systemPrompt(): string {
    return (
      this._providerRegistry.chatSystemPrompt ?? DEFAULT_CHAT_SYSTEM_PROMPT
    );
  }

  async sendMessage(message: INewMessage): Promise<boolean> {
    const body = message.body;
    if (body.startsWith('/clear')) {
      // TODO: do we need a clear method?
      this.messagesDeleted(0, this.messages.length);
      this._history = [];
      return false;
    }
    message.id = UUID.uuid4();
    const msg: IChatMessage = {
      id: message.id,
      body,
      sender: { username: 'User' },
      time: Private.getTimestampMs(),
      type: 'msg'
    };
    this.messageAdded(msg);

    const chatModel = this.chatModel;

    if (chatModel === null) {
      const errorMsg: IChatMessage = {
        id: UUID.uuid4(),
        body: `**${this._errorMessage ? this._errorMessage : this._defaultErrorMessage}**`,
        sender: { username: 'ERROR' },
        time: Private.getTimestampMs(),
        type: 'msg'
      };
      this.messageAdded(errorMsg);
      return false;
    }

    const messages = mergeMessageRuns([
      new SystemMessage(this.systemPrompt),
      ...this._history
    ]);

    const newMessage = new HumanMessage(msg.body);
    messages.push(newMessage);
    this._history.push(newMessage);

    const sender = { username: this._personaName, avatar_url: AI_AVATAR };
    this.updateWriters([{ user: sender }]);

    if (this.agent !== null) {
      return this._sendAgentMessage(this.agent, messages, sender);
    }

    return this._sentChatMessage(chatModel, messages, sender);
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

  createChatContext(): IChatContext {
    return new ChatHandler.ChatContext({ model: this });
  }

  private async _sentChatMessage(
    chatModel: AIChatModel,
    messages: BaseMessage[],
    sender: IUser
  ): Promise<boolean> {
    // Create an empty message to be filled by the AI provider
    const botMsg: IChatMessage = {
      id: UUID.uuid4(),
      body: '',
      sender,
      time: Private.getTimestampMs(),
      type: 'msg'
    };
    let content = '';
    this._controller = new AbortController();
    try {
      for await (const chunk of await chatModel.stream(messages, {
        signal: this._controller.signal
      })) {
        content += chunk.content ?? chunk;
        botMsg.body = content;
        this.messageAdded(botMsg);
      }
      this._history.push(new AIMessage(content));
      return true;
    } catch (reason) {
      const error = this._providerRegistry.formatErrorMessage(reason);
      const errorMsg: IChatMessage = {
        id: UUID.uuid4(),
        body: `**${error}**`,
        sender: { username: 'ERROR' },
        time: Private.getTimestampMs(),
        type: 'msg'
      };
      this.messageAdded(errorMsg);
      return false;
    } finally {
      this.updateWriters([]);
      this._controller = null;
    }
  }

  private async _sendAgentMessage(
    agent: AIChatModel,
    messages: BaseMessage[],
    sender: IUser
  ): Promise<boolean> {
    this._controller = new AbortController();
    try {
      for await (const chunk of await agent.stream(
        { messages },
        {
          streamMode: 'updates',
          signal: this._controller.signal
        }
      )) {
        if ((chunk as any).agent) {
          messages = (chunk as any).agent.messages;
          messages.forEach(message => {
            this._history.push(message);
            const contents: string[] = [];
            if (typeof message.content === 'string') {
              contents.push(message.content);
            } else if (Array.isArray(message.content)) {
              message.content.forEach(content => {
                if (content.type === 'text') {
                  contents.push(content.text);
                }
              });
            }
            contents.forEach(content => {
              this.messageAdded({
                id: UUID.uuid4(),
                body: content,
                sender,
                time: Private.getTimestampMs(),
                type: 'msg'
              });
            });
          });
        } else if ((chunk as any).tools) {
          messages = (chunk as any).tools.messages;
          messages.forEach(message => {
            this._history.push(message);
            const content = message.content as string;
            const contentData = JSON.parse(content);
            const title = contentData.command
              ? contentData.command
              : 'Show details';
            const body = `<details><summary>${title}</summary><pre>${content}</pre></details>`;
            this.messageAdded({
              id: UUID.uuid4(),
              body,
              sender: { username: `Tool "${message.name}"` },
              time: Private.getTimestampMs(),
              type: 'msg'
            });
          });
        }
      }
      return true;
    } catch (reason) {
      const error = this._providerRegistry.formatErrorMessage(reason);
      const errorMsg: IChatMessage = {
        id: UUID.uuid4(),
        body: `**${error}**`,
        sender: { username: 'ERROR' },
        time: Private.getTimestampMs(),
        type: 'msg'
      };
      this.messageAdded(errorMsg);
      return false;
    } finally {
      this.updateWriters([]);
      this._controller = null;
    }
  }

  private _providerRegistry: IAIProviderRegistry;
  private _personaName = 'AI';
  private _errorMessage: string = '';
  private _history: BaseMessage[] = [];
  private _defaultErrorMessage = 'AI provider not configured';
  private _controller: AbortController | null = null;
  private _toolRegistry?: IToolRegistry;
}

export namespace ChatHandler {
  /**
   * The options used to create a chat handler.
   */
  export interface IOptions extends IChatModel.IOptions {
    providerRegistry: IAIProviderRegistry;
    toolRegistry?: IToolRegistry;
  }

  /**
   * The chat context.
   */
  export class ChatContext extends AbstractChatContext {
    users = [];

    /**
     * The provider registry.
     */
    get providerRegistry(): IAIProviderRegistry {
      return (this._model as ChatHandler).providerRegistry;
    }

    /**
     * The tool registry.
     */
    get toolsRegistry(): IToolRegistry | undefined {
      return (this._model as ChatHandler).toolRegistry;
    }
  }

  /**
   *  The chat command provider for the chat.
   */
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
    async listCommandCompletions(inputModel: IInputModel) {
      const match = inputModel.currentWord?.match(/^\/\w*/)?.[0];
      if (!match) {
        return [];
      }

      const commands = this._slash_commands.filter(cmd =>
        cmd.name.startsWith(match)
      );
      return commands;
    }

    async onSubmit(inputModel: IInputModel): Promise<void> {
      // no handling needed because `replaceWith` is set in each command.
      return;
    }
  }
}

namespace Private {
  /**
   * Return the current timestamp in milliseconds.
   */
  export function getTimestampMs(): number {
    return Date.now() / 1000;
  }
}
