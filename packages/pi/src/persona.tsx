import type { PersonaSessionRegistry } from '@jupyter-ai/persona-manager';
import {
  TooltippedIconButton,
  type IChatModel,
  type IChatPanel,
  type IMessage,
  type IUser
} from '@jupyter/chat';
import { Signal, type ISignal } from '@lumino/signaling';
import StopIcon from '@mui/icons-material/Stop';
import React, { useEffect, useState } from 'react';

import type { PiAgent } from './agent';
import type { PiChatSession } from './runtime';
import { PI_PERSONA_ID } from './tokens';

const PI_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#111827"/><text x="16" y="22.5" font-family="Georgia, serif" font-size="20" fill="#fff" text-anchor="middle">π</text></svg>'
  );

/**
 * The chat user of the pi persona.
 */
const PI_USER: IUser = {
  username: PI_PERSONA_ID,
  display_name: 'Pi',
  initials: 'π',
  color: '#111827',
  avatar_url: PI_AVATAR,
  bot: true,
  mention_name: 'pi'
};

const STOP_ITEM = 'pi-stop';
const OTHER_STOP_ITEMS = ['stop', 'jupyternaut-stop'];

/**
 * The pi mention as a whole word.
 */
const MENTION = /(^|\s)@pi(?=$|[\s.,;:!?)])/g;

interface IInputMetadata {
  to_persona?: string;
  model?: PiChatSession.ISelection;
}

/**
 * The prompt of a message: its body without the pi mention.
 */
function promptText(message: IMessage): string {
  const body = message.body.trim();
  if (!message.mentions?.some(user => user.username === PI_PERSONA_ID)) {
    return body;
  }
  return message.body.replace(MENTION, '$1').trim() || body;
}

/**
 * The pi persona of one chat: it starts the pi session when pi is selected
 * or receives a message, and forwards the messages that the local user sends
 * to pi. The chat can have several models (views that are not synchronized):
 * pi answers in the model of each message.
 */
class PiChat {
  constructor(options: PiChat.IOptions) {
    this._agent = options.agent;
    this._model = options.model;
    this._chatId = options.chatId;
    this._registry = options.registry;
    this.addModel(options.model);
    this._agent.configChanged.connect(this._onConfigChanged, this);
  }

  get busy(): boolean {
    return this._busy;
  }

  get busyChanged(): ISignal<this, boolean> {
    return this._busyChanged;
  }

  /**
   * Answer the messages of another model of the chat.
   */
  addModel(model: IChatModel): void {
    if (this._models.has(model)) {
      return;
    }
    this._models.add(model);
    for (const message of model.messages) {
      this._handled.add(message.id);
    }
    model.messagesUpdated.connect(this._onMessages, this);
  }

  /**
   * Stop answering in a model whose panels are closed.
   */
  removeModel(model: IChatModel): void {
    if (!this._models.delete(model)) {
      return;
    }
    model.messagesUpdated.disconnect(this._onMessages, this);
    const next = this._models.values().next().value;
    if (model === this._model && next) {
      this._model = next;
      this._current?.setModel(next);
    }
  }

  /**
   * Create the pi session of the chat, once. A failed start is tried again
   * on the next call.
   */
  session(): Promise<PiChatSession> {
    this._session ??= this._start().catch(error => {
      this._session = undefined;
      throw error;
    });
    return this._session;
  }

  /**
   * Apply the model and thinking selection of the persona controls.
   */
  select(selection?: PiChatSession.ISelection): void {
    this.session()
      .then(session => session.select(selection))
      .catch(error => {
        if (!this._disposed) {
          console.error('pi: cannot start the session', error);
        }
      });
  }

  stop(): void {
    this._current?.stop();
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    for (const model of this._models) {
      model.messagesUpdated.disconnect(this._onMessages, this);
    }
    this._agent.configChanged.disconnect(this._onConfigChanged, this);
    this._current?.dispose();
  }

  private async _start(): Promise<PiChatSession> {
    const { runtime, host } = await this._agent.load();
    if (this._disposed) {
      throw new Error('The chat is closed.');
    }
    const session = new runtime.PiChatSession({
      host,
      model: this._model,
      chatId: this._chatId,
      persona: PI_USER
    });
    this._current = session;
    try {
      await session.start();
    } catch (error) {
      session.dispose();
      this._current = undefined;
      throw error;
    }
    if (this._disposed) {
      throw new Error('The chat is closed.');
    }
    session.stateChanged.connect(this._onStateChanged, this);
    this._onStateChanged();
    return session;
  }

  private _onMessages(model: IChatModel): void {
    const user = model.user?.username;
    for (const message of model.messages) {
      if (this._handled.has(message.id)) {
        continue;
      }
      this._handled.add(message.id);
      // Other clients of a collaborative chat answer their own users.
      if (message.sender.bot || (user && message.sender.username !== user)) {
        continue;
      }
      const metadata = message.metadata as IInputMetadata | undefined;
      if (
        metadata?.to_persona === PI_PERSONA_ID ||
        message.mentions?.some(mention => mention.username === PI_PERSONA_ID)
      ) {
        void this._respond(message, model);
      }
    }
  }

  private async _respond(message: IMessage, model: IChatModel): Promise<void> {
    let session: PiChatSession;
    try {
      session = await this.session();
    } catch (error) {
      if (!this._disposed) {
        console.error('pi: cannot start the session', error);
        const text = error instanceof Error ? error.message : String(error);
        void model.sendMessage({
          body: '',
          sender: PI_USER,
          mime_model: {
            data: { 'application/vnd.jupyter.chat.components': 'error' },
            metadata: { errorMessage: `pi cannot start: ${text}` }
          }
        } as never);
      }
      return;
    }
    try {
      await session.respond(message, promptText(message), model);
    } catch (error) {
      console.error('pi: cannot answer the message', error);
    }
  }

  private async _onConfigChanged(): Promise<void> {
    try {
      await this._current?.refreshModels();
    } catch (error) {
      console.warn('pi: cannot load the models again', error);
    }
    await this._publish();
  }

  private _onStateChanged(): void {
    const busy = this._current?.busy ?? false;
    if (busy !== this._busy) {
      this._busy = busy;
      this._busyChanged.emit(busy);
    }
    void this._publish();
  }

  private async _publish(): Promise<void> {
    if (!this._current || this._disposed) {
      return;
    }
    try {
      this._registry.updatePersonaState(
        this._chatId,
        PI_PERSONA_ID,
        await this._current.state()
      );
    } catch (error) {
      console.warn('pi: cannot publish the persona state', error);
    }
  }

  private _agent: PiAgent;
  private _model: IChatModel;
  private _chatId: string;
  private _registry: PersonaSessionRegistry;
  private _models = new Set<IChatModel>();
  private _session?: Promise<PiChatSession>;
  private _current?: PiChatSession;
  /**
   * Ids of the messages of the chat that pi has seen. The models of the chat
   * share message ids: pi answers each message once.
   */
  private _handled = new Set<string>();
  private _busy = false;
  private _disposed = false;
  private _busyChanged = new Signal<this, boolean>(this);
}

namespace PiChat {
  export interface IOptions {
    agent: PiAgent;
    model: IChatModel;
    chatId: string;
    registry: PersonaSessionRegistry;
  }
}

/**
 * Stop button of the pi persona in the chat input toolbar.
 */
function PiStopButton({ chat }: { chat: PiChat }): JSX.Element {
  const [busy, setBusy] = useState(chat.busy);
  const tooltip = 'Stop pi';

  useEffect(() => {
    setBusy(chat.busy);
    const onBusyChanged = (sender: PiChat, value: boolean) => setBusy(value);
    chat.busyChanged.connect(onBusyChanged);
    return () => {
      chat.busyChanged.disconnect(onBusyChanged);
    };
  }, [chat]);

  return (
    <TooltippedIconButton
      onClick={() => chat.stop()}
      tooltip={tooltip}
      disabled={!busy}
      buttonProps={{ title: tooltip }}
      aria-label={tooltip}
    >
      <StopIcon />
    </TooltippedIconButton>
  );
}

/**
 * The pi chats of the page by chat id, with their open panels. Several
 * panels can show one chat (a new view, or the main area and the side
 * panel): one pi answers for all of them.
 */
const chats = new Map<string, { chat: PiChat; panels: Set<IChatPanel> }>();
const attached = new WeakSet<IChatPanel>();

/**
 * Add the pi persona to a chat panel.
 */
export async function attachPiChat(
  panel: IChatPanel,
  agent: PiAgent,
  registry: PersonaSessionRegistry
): Promise<void> {
  if (attached.has(panel)) {
    return;
  }
  attached.add(panel);
  const chatId = await panel.model.ready.catch(() => undefined);
  if (!chatId || panel.isDisposed || panel.model.isDisposed) {
    return;
  }
  let entry = chats.get(chatId);
  if (!entry) {
    registry.registerFrontendPersona(chatId, {
      id: PI_PERSONA_ID,
      name: PI_USER.display_name!,
      avatar_url: PI_AVATAR
    });
    entry = {
      chat: new PiChat({ agent, model: panel.model, chatId, registry }),
      panels: new Set()
    };
    chats.set(chatId, entry);
  }
  const { chat, panels } = entry;
  panels.add(panel);
  chat.addModel(panel.model);

  const toolbar = panel.widget.inputToolbarRegistry;
  if (toolbar && !toolbar.get(STOP_ITEM)) {
    toolbar.addItem(STOP_ITEM, {
      element: () => <PiStopButton chat={chat} />,
      position: 7
    });
    toolbar.hide(STOP_ITEM);
  }
  const onInputMetadata = () => {
    const metadata = panel.model.input.getMetadata() as IInputMetadata;
    if (metadata.to_persona !== PI_PERSONA_ID) {
      toolbar?.hide(STOP_ITEM);
      return;
    }
    chat.select(metadata.model);
    // Other personas toggle their stop buttons on the same signal: apply the
    // pi visibility after them.
    queueMicrotask(() => {
      for (const item of OTHER_STOP_ITEMS) {
        toolbar?.hide(item);
      }
      toolbar?.show(STOP_ITEM);
    });
  };
  onInputMetadata();
  panel.model.input.metadataChanged?.connect(onInputMetadata);

  const detach = () => {
    if (!panels.delete(panel)) {
      return;
    }
    panel.model.input.metadataChanged?.disconnect(onInputMetadata);
    if (!panels.size) {
      chats.delete(chatId);
      registry.unregisterFrontendPersona(chatId, PI_PERSONA_ID);
      chat.dispose();
      return;
    }
    if (![...panels].some(item => item.model === panel.model)) {
      chat.removeModel(panel.model);
    }
  };
  panel.disposed.connect(detach);
  panel.model.disposed.connect(detach);
}
