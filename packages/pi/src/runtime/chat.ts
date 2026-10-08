import {
  SessionManager,
  type AgentEndEvent,
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime
} from '@earendil-works/pi-coding-agent';
import { contentText, type Model } from '@earendil-works/pi-ai';
import type { PersonaStatePayload } from '@jupyter-ai/persona-manager';
import type { IAttachment, IChatModel, IMessage, IUser } from '@jupyter/chat';
import type { IDocumentManager } from '@jupyterlab/docmanager';
import { extractMimeBundles } from '@jupyternaut/agent';
import { Signal, type ISignal } from '@lumino/signaling';
import fs from 'fs';
import { findInitialModel } from 'pi-coding-agent-package/dist/core/model-resolver.js';
import type { IToolCallsEntry } from 'jupyter-chat-components';
import path from 'path';

import {
  summarize,
  type ApprovalDecision,
  type IApprovalRequest
} from './extension';
import type { PiHost } from './host';
import { AGENT_DIR, DRIVE, drivePath } from './vfs';

const CHAT_SESSIONS_FILE = path.join(AGENT_DIR, 'jupyter-chats.json');
/**
 * The chat sessions have a folder of their own: `pi -c` in a terminal does
 * not continue them, `/resume` (All) lists them.
 */
const CHAT_SESSION_DIR = path.join(AGENT_DIR, 'sessions', 'jupyter-chats');
const COMPONENTS_MIME = 'application/vnd.jupyter.chat.components';
const MAX_DISPLAYED_OUTPUT = 5000;
const THINKING_SETTING = 'thinking';

const CHAT_INSTRUCTIONS =
  'You run in pi, the coding agent, as a persona of a Jupyter chat. Your answers are rendered as markdown in the chat panel. The rich outputs (plots, tables, HTML) of jupyterlab-ai-commands:execute-in-kernel are shown in the chat: to show one, run the code that makes it.';

const NO_MODEL_MESSAGE =
  'pi has no model to use. Add an API key with the "Pi: Set a Model Provider API Key" command, or a model server with the "Pi: Add an OpenAI-Compatible Endpoint" command (in the command palette).';

/**
 * pi errors of `/compact` that are not failures.
 */
const COMPACT_NOTICES: [RegExp, string][] = [
  [/^Nothing to compact/, 'Nothing to compact yet.'],
  [/^Already compacted/, 'The conversation is already compacted.']
];

const TOOL_KINDS: Record<string, string> = {
  bash: 'execute',
  find: 'search',
  grep: 'search',
  ls: 'read',
  write: 'edit'
};

const PERMISSION_OPTIONS = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' }
];

interface IToolCallState {
  toolCallId: string;
  toolName: string;
  title: string;
  input: unknown;
  status: string;
  output?: string;
  permission?: 'pending' | 'resolved';
  selectedOptionId?: string;
  messageId?: Promise<string | undefined>;
  /**
   * Whether the final state was posted, in chats that cannot update it.
   */
  posted?: boolean;
}

/**
 * A tool call entry of the chat, with the chat user who asked for the run.
 */
type IToolCallEntry = IToolCallsEntry & { owner?: string };

/**
 * Approvals waiting for a click in a chat, by chat session id and tool call
 * id.
 */
const pendingApprovals = new Map<
  string,
  (decision: ApprovalDecision, stopped: boolean) => void
>();

function approvalKey(targetId: string, toolCallId: string): string {
  return `${targetId}\n${toolCallId}`;
}

function settleApproval(
  key: string,
  decision: ApprovalDecision,
  stopped = false
): void {
  const resolve = pendingApprovals.get(key);
  pendingApprovals.delete(key);
  resolve?.(decision, stopped);
}

/**
 * Route a permission decision of the tool call component; it does nothing
 * when the tool call is not a pending pi approval of that chat.
 */
export function decideApproval(
  targetId: string,
  toolCallId: string,
  optionId: string
): void {
  settleApproval(
    approvalKey(targetId, toolCallId),
    optionId === 'always' ? 'always' : optionId === 'allow' ? 'allow' : 'reject'
  );
}

function readChatSessions(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CHAT_SESSIONS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function modelKey(model: Model<any>): string {
  return `${model.provider}/${model.id}`;
}

/**
 * pi's stand-in model when no provider has credentials.
 */
function isPlaceholder(model: Model<any>): boolean {
  return (
    model.provider === 'unknown' &&
    model.id === 'unknown' &&
    model.api === 'unknown'
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The shared model of an open notebook, as far as `cellsPrompt` reads it.
 */
interface INotebookSource {
  sharedModel?: {
    cells?: { id: string; cell_type: string; getSource(): string }[];
  };
}

/**
 * The source of the attached cells, from the open notebook: it can have
 * changes that are not saved.
 */
function cellsPrompt(
  attachment: IAttachment,
  documentManager?: IDocumentManager
): string | undefined {
  const model = documentManager?.findWidget(attachment.value)?.context.model as
    | INotebookSource
    | undefined;
  const cells = model?.sharedModel?.cells;
  if (!cells || attachment.type !== 'notebook') {
    return undefined;
  }
  const blocks = (attachment.cells ?? []).flatMap(({ id }) => {
    const cell = cells.find(candidate => candidate.id === id);
    return cell
      ? [`Cell ${id} (${cell.cell_type}):\n\`\`\`\n${cell.getSource()}\n\`\`\``]
      : [];
  });
  return blocks.length
    ? `- ${drivePath(attachment.value)}:\n\n${blocks.join('\n\n')}`
    : undefined;
}

function attachmentsPrompt(
  attachments: IAttachment[] = [],
  documentManager?: IDocumentManager
): string {
  if (!attachments.length) {
    return '';
  }
  const lines = attachments.map(attachment => {
    const file = drivePath(attachment.value);
    if (attachment.type === 'notebook' && attachment.cells?.length) {
      return (
        cellsPrompt(attachment, documentManager) ??
        `- ${file} (cells: ${attachment.cells.map(cell => cell.id).join(', ')})`
      );
    }
    if (attachment.type === 'file' && attachment.selection) {
      const { start, end, content } = attachment.selection;
      return `- ${file}, lines ${start[0] + 1}-${end[0] + 1}:\n\n\`\`\`\n${content}\n\`\`\``;
    }
    return `- ${file}`;
  });
  return `\n\nAttached by the user:\n${lines.join('\n')}`;
}

/**
 * A pi agent session behind one chat: it answers the messages sent to the
 * pi persona and renders the run (text, tool calls, approvals, errors).
 */
export class PiChatSession {
  constructor(options: PiChatSession.IOptions) {
    this._host = options.host;
    this._model = options.model;
    this._chatId = options.chatId;
    this._persona = options.persona;
    this._targetId = options.model.name || options.chatId;
  }

  get stateChanged(): ISignal<this, void> {
    return this._stateChanged;
  }

  get busy(): boolean {
    return this._busy;
  }

  /**
   * Create the agent session, reopening the one of this chat if any.
   */
  async start(): Promise<void> {
    this._interruptStaleTools();
    const sessionFile = readChatSessions()[this._chatId];
    const sessionManager =
      sessionFile && fs.existsSync(sessionFile)
        ? SessionManager.open(sessionFile)
        : SessionManager.create(DRIVE, CHAT_SESSION_DIR);
    this._shell = this._host.createShell();
    const runtime = await this._host.createRuntime({
      cwd: DRIVE,
      sessionManager,
      approve: request => this._approve(request),
      instructions: CHAT_INSTRUCTIONS,
      shell: this._shell
    });
    if (this._disposed) {
      void runtime.dispose();
      return;
    }
    this._runtime = runtime;
    runtime.setRebindSession(session => this._bind(session, true));
    await this._bind(runtime.session, false);
  }

  /**
   * Send the messages of the session to another model of the same chat.
   */
  setModel(model: IChatModel): void {
    if (this._busy) {
      if (!this._model.isDisposed) {
        this._model.clearWritingStatus(this._persona);
      }
      model.setWritingStatus(this._persona);
    }
    this._model = model;
  }

  /**
   * The persona-manager state: models, thinking level, usage, commands.
   */
  async state(): Promise<PersonaStatePayload> {
    const session = this._runtime?.session;
    if (!session) {
      return { processing: this._busy };
    }
    const available = await session.modelRuntime.getAvailable();
    const current =
      session.model && !isPlaceholder(session.model)
        ? session.model
        : undefined;
    const models =
      current && !available.some(model => modelKey(model) === modelKey(current))
        ? [current, ...available]
        : available;
    const levels = current ? session.getAvailableThinkingLevels() : [];
    const stats = session.getSessionStats();
    const context = current ? session.getContextUsage() : undefined;
    return {
      model: {
        current: current ? modelKey(current) : null,
        options: models.map(model => ({
          id: modelKey(model),
          name: model.name,
          description: model.provider
        })),
        settings:
          levels.length > 1
            ? [
                {
                  id: THINKING_SETTING,
                  name: 'Thinking',
                  description: 'Reasoning effort of the model',
                  current: session.thinkingLevel,
                  options: levels.map(level => ({
                    id: level,
                    name: level,
                    description: null
                  }))
                }
              ]
            : []
      },
      usage: {
        context_tokens: context?.tokens ?? null,
        context_size: context?.contextWindow ?? null,
        context_percent: context?.percent ?? null,
        input_tokens: stats.tokens.input,
        output_tokens: stats.tokens.output,
        cached_read_tokens: stats.tokens.cacheRead,
        cached_write_tokens: stats.tokens.cacheWrite,
        thought_tokens: null,
        total_tokens: stats.tokens.total,
        cost_amount: stats.cost || null,
        cost_currency: stats.cost ? 'USD' : null
      },
      slash_commands: [
        { name: 'new', description: 'Start a new pi session' },
        { name: 'compact', description: 'Summarize the conversation' },
        ...session.promptTemplates.map(template => ({
          name: template.name,
          description: template.description
        })),
        ...session.resourceLoader.getSkills().skills.map(skill => ({
          name: `skill:${skill.name}`,
          description: skill.description
        }))
      ],
      processing: this._busy
    };
  }

  /**
   * Load the models and credentials of pi again, and select a default model
   * when the session has none that works (as pi does after a login).
   */
  async refreshModels(): Promise<void> {
    const session = this._runtime?.session;
    if (!session || this._disposed) {
      return;
    }
    await session.modelRuntime.refresh({ allowNetwork: false });
    if (this._hasUsableModel(session)) {
      return;
    }
    const settings = session.settingsManager;
    await settings.reload();
    const { model, thinkingLevel } = await findInitialModel({
      scopedModels: [],
      isContinuing: false,
      defaultProvider: settings.getDefaultProvider(),
      defaultModelId: settings.getDefaultModel(),
      defaultThinkingLevel: settings.getDefaultThinkingLevel(),
      modelThinkingLevels: settings.getAllModelThinkingLevels(),
      modelRuntime: session.modelRuntime
    });
    if (model) {
      await session.setModel(model);
      session.setThinkingLevel(thinkingLevel);
    }
  }

  /**
   * Apply the model and thinking selection of the persona controls.
   */
  async select(selection?: PiChatSession.ISelection): Promise<void> {
    const session = this._runtime?.session;
    if (!session || this._disposed) {
      return;
    }
    try {
      if (await this._applySelection(session, selection, true)) {
        this._stateChanged.emit();
      }
    } catch (error) {
      console.warn('pi: cannot apply the model selection', error);
    }
  }

  /**
   * Answer a chat message sent to the pi persona, in the model of the
   * message. Messages start one after the other; a message sent during a run
   * is queued in that run.
   */
  async respond(
    message: IMessage,
    text: string,
    model: IChatModel = this._model
  ): Promise<void> {
    if (this._disposed) {
      return;
    }
    const previous = this._dispatch;
    let release = () => {};
    this._dispatch = new Promise<void>(resolve => (release = resolve));
    try {
      await previous;
      if (model !== this._model && !this._runtime?.session.isStreaming) {
        this.setModel(model);
      }
      await this._respond(message, text, release);
    } finally {
      release();
    }
  }

  stop(): void {
    const session = this._runtime?.session;
    if (!session) {
      return;
    }
    this._stopRequested = true;
    // pi keeps queued messages after an abort and sends them with the next
    // prompt.
    const { steering, followUp } = session.clearQueue();
    if (steering.length || followUp.length) {
      this._notice('Stopped: pi did not read the queued messages.');
    }
    void session.abort();
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._unsubscribe?.();
    if (this._busy && !this._model.isDisposed) {
      this._model.clearWritingStatus(this._persona);
    }
    void this._runtime?.dispose();
    void this._shell?.dispose();
  }

  private async _respond(
    message: IMessage,
    text: string,
    started: () => void
  ): Promise<void> {
    const runtime = this._runtime;
    if (this._disposed || !runtime) {
      return;
    }
    const session = runtime.session;
    const metadata = (message.metadata ?? {}) as {
      to_persona?: string;
      model?: PiChatSession.ISelection;
    };
    const selection =
      metadata.to_persona === this._persona.username
        ? metadata.model
        : undefined;
    const command = text.match(/^\/(new|compact)(?:\s+(.*))?$/s);
    const prompt =
      text + attachmentsPrompt(message.attachments, this._host.documentManager);
    try {
      if (command?.[1] === 'new') {
        await runtime.newSession();
        this._notice('Started a new pi session.');
        return;
      }
      if (!command && session.isStreaming) {
        await session.prompt(prompt, { streamingBehavior: 'followUp' });
        this._notice(
          'Queued: pi reads this message when the current run is complete.'
        );
        return;
      }
      this._stopRequested = false;
      this._setBusy(true);
      await this.refreshModels();
      await this._applySelection(session, selection);
      if (this._disposed || this._stopRequested) {
        return;
      }
      if (!this._hasUsableModel(session)) {
        throw new Error(NO_MODEL_MESSAGE);
      }
      if (command?.[1] === 'compact') {
        await this._compact(session, command[2]);
        return;
      }
      this._saveSessionFile(session.sessionFile);
      await session.prompt(prompt, { preflightResult: started });
    } catch (error) {
      if (!this._disposed && !this._stopRequested) {
        this._error(errorText(error));
      }
    } finally {
      if (!this._disposed && !this._runtime?.session.isStreaming) {
        this._setBusy(false);
        this._resumeQueue();
      }
    }
  }

  private async _compact(
    session: AgentSession,
    instructions?: string
  ): Promise<void> {
    try {
      await session.compact(instructions || undefined);
      this._notice('The conversation was compacted.');
    } catch (error) {
      const notice = COMPACT_NOTICES.find(([pattern]) =>
        pattern.test(errorText(error))
      );
      if (!notice) {
        throw error;
      }
      this._notice(notice[1]);
    }
  }

  private _hasUsableModel(session: AgentSession): boolean {
    const model = session.model;
    return (
      !!model &&
      !isPlaceholder(model) &&
      session.modelRuntime.hasConfiguredAuth(model.provider)
    );
  }

  private async _bind(session: AgentSession, rebound: boolean): Promise<void> {
    this._unsubscribe?.();
    this._unsubscribe = session.subscribe(event => this._onEvent(event));
    await session.bindExtensions({
      onError: error => console.warn('pi extension error', error)
    });
    if (rebound) {
      this._saveSessionFile(session.sessionFile);
    }
    this._stateChanged.emit();
  }

  /**
   * Apply a model selection, matching the model by its key: provider ids may
   * contain '/'. The menus have no "set as default": a choice in the menus
   * persists as the default of the new sessions. Resolves with whether the
   * session changed.
   */
  private async _applySelection(
    session: AgentSession,
    selection?: PiChatSession.ISelection,
    persist = false
  ): Promise<boolean> {
    let changed = false;
    const id = selection?.id;
    if (id && (!session.model || modelKey(session.model) !== id)) {
      const available = await session.modelRuntime.getAvailable();
      const model = available.find(candidate => modelKey(candidate) === id);
      if (model) {
        await session.setModel(model, { persist });
        changed = true;
      }
    }
    const level = selection?.settings?.[THINKING_SETTING];
    if (level && level !== session.thinkingLevel) {
      session.setThinkingLevel(level as never, { persist });
      changed = true;
    }
    return changed;
  }

  private _approve(request: IApprovalRequest): Promise<ApprovalDecision> {
    const key = approvalKey(this._targetId, request.toolCallId);
    return new Promise(resolve => {
      pendingApprovals.set(key, (decision, stopped) => {
        const tool = this._tools.get(request.toolCallId);
        if (tool && !this._disposed) {
          tool.permission = 'resolved';
          if (stopped) {
            tool.status = 'failed';
            tool.output = 'Stopped';
          } else {
            tool.selectedOptionId = decision;
            tool.status = decision === 'reject' ? 'rejected' : 'in_progress';
          }
          void this._renderTool(tool);
        }
        resolve(decision);
      });
      request.signal?.addEventListener(
        'abort',
        () => settleApproval(key, 'reject', true),
        { once: true }
      );
      const tool = this._tools.get(request.toolCallId);
      if (tool) {
        tool.status = 'awaiting_approval';
        tool.permission = 'pending';
        void this._renderTool(tool);
      }
    });
  }

  private _onEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case 'agent_start':
        this._reportRun();
        break;
      case 'message_start':
        if (event.message.role === 'assistant') {
          this._stream = {};
        }
        break;
      case 'message_update':
        if (
          this._stream &&
          event.message.role === 'assistant' &&
          event.assistantMessageEvent.type === 'text_delta'
        ) {
          void this._render(this._stream, {
            body: contentText(event.message.content, '')
          });
        }
        break;
      case 'message_end':
        if (event.message.role === 'assistant') {
          const stream = this._stream ?? {};
          this._stream = undefined;
          const text = contentText(event.message.content, '');
          if (text) {
            void this._render(stream, { body: text });
          }
        }
        break;
      case 'agent_end':
        this._lastRun = event.willRetry ? undefined : event.messages;
        break;
      case 'tool_execution_start': {
        const definition = this._runtime?.session.getToolDefinition(
          event.toolName
        );
        const tool: IToolCallState = {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          title: definition?.label ?? event.toolName,
          input: event.args,
          status: 'in_progress'
        };
        this._tools.set(event.toolCallId, tool);
        void this._renderTool(tool);
        break;
      }
      case 'tool_execution_end': {
        const tool = this._tools.get(event.toolCallId);
        if (tool) {
          this._tools.delete(event.toolCallId);
          const output = contentText(event.result?.content ?? [], '');
          tool.status = event.isError ? 'failed' : 'completed';
          tool.output ??=
            output.length > MAX_DISPLAYED_OUTPUT
              ? `${output.slice(0, MAX_DISPLAYED_OUTPUT)}\n…`
              : output;
          void this._renderTool(tool);
          if (!event.isError) {
            this._renderMimeBundles(tool, event.result?.details);
          }
        }
        break;
      }
      case 'compaction_start':
        if (event.reason !== 'manual') {
          this._notice('Compacting the conversation…');
        }
        break;
      case 'compaction_end':
        if (event.willRetry) {
          this._lastRun = undefined;
        }
        break;
      case 'auto_retry_start':
        this._notice(
          `Retrying after an error (attempt ${event.attempt} of ${event.maxAttempts}): ${event.errorMessage}`
        );
        break;
      case 'agent_settled':
        this._reportRun();
        this._finishTools(this._stopRequested ? 'Stopped' : 'Interrupted');
        this._setBusy(false);
        this._saveSessionFile(this._runtime?.session.sessionFile);
        break;
    }
  }

  /**
   * pi keeps the queued messages of a run that ends with an abort (a rejected
   * tool call or Stop): send them as the next prompt.
   */
  private _resumeQueue(): void {
    const session = this._runtime?.session;
    if (!session) {
      return;
    }
    const { steering, followUp } = session.clearQueue();
    const queued = [...steering, ...followUp].join('\n\n');
    if (queued) {
      void this.respond({ body: queued } as IMessage, queued);
    }
  }

  /**
   * Show the outcome of the last agent run. pi can still recover from an
   * error after agent_end (overflow compaction): wait for the next run or
   * agent_settled.
   */
  private _reportRun(): void {
    const messages = this._lastRun ?? [];
    this._lastRun = undefined;
    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant') {
      return;
    }
    if (last.stopReason === 'error') {
      if (!this._stopRequested) {
        this._error(last.errorMessage ?? 'The request failed.');
      }
    } else if (
      last.stopReason === 'stop' &&
      !messages.some(
        message =>
          message.role === 'toolResult' ||
          (message.role === 'assistant' && contentText(message.content, ''))
      )
    ) {
      this._notice('pi returned an empty answer.');
    }
  }

  /**
   * Close the tool calls that the run left without a result.
   */
  private _finishTools(output: string): void {
    for (const tool of this._tools.values()) {
      tool.status = 'failed';
      tool.output ??= output;
      if (tool.permission) {
        tool.permission = 'resolved';
      }
      void this._renderTool(tool);
    }
    this._tools.clear();
  }

  /**
   * Close the tool calls of an earlier page load that never completed: they
   * cannot resume, and their approval buttons would do nothing.
   */
  private _interruptStaleTools(): void {
    const user = this._model.user?.username;
    const stale = (call: IToolCallEntry) =>
      (!call.owner || call.owner === user) &&
      (call.status === 'in_progress' || call.permissionStatus === 'pending');
    for (const message of this._model.messages) {
      const mime = message.mime_model;
      if (
        message.sender.username !== this._persona.username ||
        mime?.data[COMPONENTS_MIME] !== 'grouped-tool-calls'
      ) {
        continue;
      }
      const metadata = (mime.metadata ?? {}) as {
        toolCalls?: IToolCallEntry[];
      };
      const toolCalls = metadata.toolCalls ?? [];
      if (!toolCalls.some(stale)) {
        continue;
      }
      this._update(message.id, {
        mime_model: {
          ...mime,
          metadata: {
            ...metadata,
            toolCalls: toolCalls.map(call =>
              stale(call)
                ? {
                    ...call,
                    status: 'failed',
                    rawOutput: 'Interrupted',
                    ...(call.permissionStatus && {
                      permissionStatus: 'resolved'
                    })
                  }
                : call
            )
          } as never
        }
      });
    }
  }

  /**
   * Send the message of a stream or a tool call once, then update it.
   */
  private async _render(
    target: { messageId?: Promise<string | undefined> },
    content: { body: string; mime_model?: unknown }
  ): Promise<void> {
    if (!target.messageId) {
      target.messageId = this._send(content);
      return;
    }
    const id = await target.messageId;
    if (id) {
      this._update(id, content as never);
    }
  }

  private async _renderTool(tool: IToolCallState): Promise<void> {
    const summary = summarize(tool.toolName, tool.input);
    const owner = this._model.user?.username;
    const entry: IToolCallEntry = {
      toolCallId: tool.toolCallId,
      title: tool.title,
      ...(summary && { summary }),
      kind: TOOL_KINDS[tool.toolName] ?? tool.toolName,
      status: tool.status,
      rawInput: JSON.stringify(tool.input, null, 2),
      rawOutput: tool.output,
      targetId: this._targetId,
      ...(owner && { owner }),
      ...(tool.permission && {
        permissionStatus: tool.permission,
        permissionOptions: PERMISSION_OPTIONS,
        selectedOptionId: tool.selectedOptionId
      })
    };
    const mime_model = {
      data: { [COMPONENTS_MIME]: 'grouped-tool-calls' },
      metadata: { toolCalls: [entry] }
    };
    if (!this._editsKeepRichContent) {
      const final = tool.status !== 'awaiting_approval';
      if (tool.status !== 'in_progress' && !(final && tool.posted)) {
        tool.posted ||= final;
        await this._send({ body: '', mime_model });
      }
      return;
    }
    await this._render(tool, { body: '', mime_model });
  }

  /**
   * Whether an edited message keeps its rich content: a chat synchronized by
   * a Jupyter server (jupyterlab-chat 0.25, private `_wsHandler`) drops it.
   * There, a tool call is posted when it waits for an approval and when it
   * ends, not updated.
   */
  private get _editsKeepRichContent(): boolean {
    return !(this._model as { _wsHandler?: unknown })._wsHandler;
  }

  private _renderMimeBundles(tool: IToolCallState, details: unknown): void {
    const input = (tool.input ?? {}) as { commandId?: string };
    const config = this._host.settingsModel?.config;
    if (
      tool.toolName !== 'execute_command' ||
      !config?.commandsAutoRenderMimeBundles.includes(input.commandId ?? '')
    ) {
      return;
    }
    const trusted = new Set(config.trustedMimeTypesForAutoRender);
    for (const bundle of extractMimeBundles(details, trusted)) {
      void this._send({ body: '', mime_model: bundle });
    }
  }

  private _notice(text: string): void {
    void this._send({ body: `_${text}_` });
  }

  private _error(text: string): void {
    void this._send({
      body: '',
      mime_model: {
        data: { [COMPONENTS_MIME]: 'error' },
        metadata: { errorMessage: text }
      }
    });
  }

  private async _send(content: {
    body: string;
    mime_model?: unknown;
  }): Promise<string | undefined> {
    const id = await this._model.sendMessage({
      ...content,
      sender: this._persona
    } as never);
    if (!id) {
      return undefined;
    }
    await this._waitForMessage(id);
    return id;
  }

  private _update(id: string, content: Partial<IMessage['content']>): void {
    const message = this._model.messages.find(m => m.id === id);
    if (!message) {
      return;
    }
    if (this._model.updateMessage) {
      this._model.updateMessage(id, { ...message.content, ...content });
    } else {
      message.update(content);
    }
  }

  /**
   * Chats synchronized through a server add a sent message only when it
   * comes back: wait for it before updating it.
   */
  private _waitForMessage(id: string): Promise<void> {
    if (this._model.messages.some(m => m.id === id)) {
      return Promise.resolve();
    }
    const model = this._model;
    return new Promise(resolve => {
      const done = () => {
        window.clearTimeout(timer);
        model.messagesUpdated.disconnect(check);
        resolve();
      };
      const check = () => {
        if (model.messages.some(m => m.id === id)) {
          done();
        }
      };
      const timer = window.setTimeout(done, 5000);
      model.messagesUpdated.connect(check);
    });
  }

  private _setBusy(busy: boolean): void {
    if (busy === this._busy) {
      return;
    }
    this._busy = busy;
    if (busy) {
      this._model.setWritingStatus(this._persona);
    } else {
      this._model.clearWritingStatus(this._persona);
    }
    this._stateChanged.emit();
  }

  /**
   * Map the chat to its pi session file. The file may not exist yet: start()
   * then creates a new session.
   */
  private _saveSessionFile(sessionFile?: string): void {
    if (!sessionFile) {
      return;
    }
    const sessions = readChatSessions();
    if (sessions[this._chatId] !== sessionFile) {
      sessions[this._chatId] = sessionFile;
      fs.writeFileSync(CHAT_SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    }
  }

  private _host: PiHost;
  private _model: IChatModel;
  private _chatId: string;
  private _targetId: string;
  private _persona: IUser;
  private _runtime?: AgentSessionRuntime;
  private _shell?: ReturnType<PiHost['createShell']>;
  private _unsubscribe?: () => void;
  private _stream?: { messageId?: Promise<string | undefined> };
  private _tools = new Map<string, IToolCallState>();
  private _dispatch = Promise.resolve();
  private _lastRun?: AgentEndEvent['messages'];
  private _stopRequested = false;
  private _busy = false;
  private _disposed = false;
  private _stateChanged = new Signal<this, void>(this);
}

export namespace PiChatSession {
  export interface IOptions {
    host: PiHost;
    model: IChatModel;
    chatId: string;
    persona: IUser;
  }

  /**
   * The model selection that the persona controls add to a message: a null
   * id or setting keeps the current value.
   */
  export interface ISelection {
    id?: string | null;
    settings?: Record<string, string | null>;
  }
}
