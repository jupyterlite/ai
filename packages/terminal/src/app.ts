import type {
  IAgentManager,
  IAISettingsModel,
  IProviderRegistry
} from '@jupyternaut/agent';

import type { IKey } from './keys';
import {
  setDarkMode,
  style,
  theme,
  truncate,
  visibleWidth,
  wrapAnsi
} from './render/ansi';
import { parseBlocks, renderBlocks, renderInline } from './render/markdown';
import { type ICaret, Screen } from './render/screen';
import type { TerminalSession } from './session';
import type { Tty } from './tty';
import { box } from './ui/box';
import { LineEditor, renderInputBox } from './ui/input';

const SPINNER_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const SPINNER_INTERVAL_MS = 100;
const RESIZE_POLL_MS = 500;
const CTRL_C_EXIT_WINDOW_MS = 2000;
const MAX_RESULT_LINES = 6;
const MAX_BANNER_WIDTH = 64;
const PLACEHOLDER = 'Ask anything, /help for commands';

interface ISlashCommand {
  name: string;
  description: string;
}

const SLASH_COMMANDS: ISlashCommand[] = [
  { name: 'help', description: 'Show the commands and shortcuts' },
  { name: 'model', description: 'Switch the provider and model' },
  { name: 'tools', description: 'List the tools available to the agent' },
  { name: 'clear', description: 'Clear the conversation' },
  { name: 'settings', description: 'Open the AI settings panel' },
  { name: 'exit', description: 'Leave the agent' }
];

type Mode = 'idle' | 'busy' | 'approval' | 'select' | 'done';

interface IAssistantItem {
  kind: 'assistant';
  text: string;
  /**
   * Number of rendered lines already printed above the dynamic region.
   */
  committed: number;
  /**
   * Whether the blank line separating the message from the previous item was printed.
   */
  separated: boolean;
}

interface IToolItem {
  kind: 'tool';
  callId: string;
  name: string;
  summary: string;
  args: unknown;
  result?: string[];
}

type TranscriptItem =
  | { kind: 'text'; lines: string[] }
  | { kind: 'banner'; rows: string[] }
  | { kind: 'user'; text: string }
  | IAssistantItem
  | IToolItem
  | { kind: 'error'; text: string };

interface IApproval {
  toolCallId: string;
  toolName: string;
  args: unknown;
  selected: number;
}

interface IMenu {
  title: string;
  items: { label: string; detail?: string }[];
  selected: number;
  onSelect: (index: number) => void;
}

export interface ITerminalAppOptions {
  tty: Tty;
  session: TerminalSession;
  settingsModel: IAISettingsModel;
  providerRegistry?: IProviderRegistry;
  isDarkMode: () => boolean;
  openSettings: () => Promise<unknown>;
}

function formatTokens(count: number): string {
  if (count < 1000) {
    return `${count}`;
  }
  if (count < 1000000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

function compactJson(value: unknown, max = 100): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  text = (text ?? '').replace(/\s+/g, ' ');
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Short description of a tool call shown next to its name.
 */
function describeToolCall(name: string, args: unknown): string {
  const input = (args ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'shell':
      return String(input.command ?? '');
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return String(input.path ?? '');
    case 'list_files':
      return String(input.path ?? '.');
    case 'execute_command':
      return String(input.commandId ?? '');
    case 'browser_fetch':
    case 'web_fetch':
      return String(input.url ?? '');
    case 'discover_commands':
    case 'discover_skills':
    case 'web_search':
      return String(input.query ?? '');
    case 'load_skill':
      return String(input.name ?? '');
    default:
      return compactJson(input, 80);
  }
}

/**
 * What a "don't ask again" answer covers: the JupyterLab command for
 * `execute_command`, the whole tool otherwise.
 */
function approvalScope(name: string, args: unknown): string {
  const input = (args ?? {}) as Record<string, unknown>;
  if (name === 'execute_command' && typeof input.commandId === 'string') {
    return `${name}:${input.commandId}`;
  }
  return name;
}

/**
 * Interactive terminal UI for one invocation of the command.
 */
export class TerminalApp {
  constructor(options: ITerminalAppOptions) {
    this._tty = options.tty;
    this._session = options.session;
    this._agent = options.session.agent;
    this._settingsModel = options.settingsModel;
    this._providerRegistry = options.providerRegistry;
    this._isDarkMode = options.isDarkMode;
    this._openSettings = options.openSettings;
    this._screen = new Screen(
      text => this._tty.write(text),
      this._tty.size.rows
    );
  }

  async run(): Promise<number> {
    setDarkMode(this._isDarkMode());
    this._width = Math.max(20, this._tty.size.columns - 1);
    this._rows = this._tty.size.rows;
    this._tty.enterRawMode();
    this._screen.enter();
    this._agent.agentEvent.connect(this._onAgentEvent, this);
    this._agent.tokenUsageChanged.connect(this._onTokenUsage, this);
    this._resizeTimer = setInterval(() => this._checkResize(), RESIZE_POLL_MS);

    this._printBanner();
    if (!this._agent.hasValidConfig()) {
      this._commitNotice(
        theme.warning +
          'No AI provider is configured. Run /settings to open the AI settings, then come back here.' +
          style.reset
      );
    }
    this._render();

    try {
      for await (const key of this._tty.keys()) {
        await this._handleKey(key);
        if (this._mode === 'done') {
          break;
        }
        this._render();
      }
    } finally {
      this._mode = 'done';
      clearInterval(this._resizeTimer);
      this._stopSpinner();
      this._agent.agentEvent.disconnect(this._onAgentEvent, this);
      this._agent.tokenUsageChanged.disconnect(this._onTokenUsage, this);
      this._finishMessage();
      this._screen.render(this._takePending(), []);
      this._screen.exit();
      this._tty.restore();
    }
    return 0;
  }

  // ---------------------------------------------------------------------
  // Key handling
  // ---------------------------------------------------------------------

  private async _handleKey(key: IKey): Promise<void> {
    if (this._handleScrollKey(key)) {
      return;
    }
    switch (this._mode) {
      case 'approval':
        this._handleApprovalKey(key);
        return;
      case 'select':
        this._handleMenuKey(key);
        return;
      case 'idle':
      case 'busy':
        await this._handleEditorKey(key);
        return;
      default:
        return;
    }
  }

  /**
   * Scroll the transcript.
   */
  private _handleScrollKey(key: IKey): boolean {
    if (key.ctrl || key.meta) {
      return false;
    }
    const page = Math.max(1, this._rows - 5);
    switch (key.name) {
      case 'wheelup':
        this._screen.scrollBy(3);
        return true;
      case 'wheeldown':
        this._screen.scrollBy(-3);
        return true;
      case 'pageup':
        this._screen.scrollBy(page);
        return true;
      case 'pagedown':
        this._screen.scrollBy(-page);
        return true;
      case 'end':
        if (this._editor.isEmpty && this._screen.scrollOffset > 0) {
          this._screen.scrollToBottom();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  private async _handleEditorKey(key: IKey): Promise<void> {
    const editor = this._editor;
    this._hint = undefined;

    if (key.ctrl) {
      switch (key.name) {
        case 'c':
          this._onInterrupt();
          return;
        case 'd':
          if (editor.isEmpty) {
            this._exit();
          }
          return;
        case 'l':
          this._redrawAll();
          return;
        case 'a':
          editor.home();
          return;
        case 'e':
          editor.end();
          return;
        case 'u':
          editor.killToStart();
          return;
        case 'k':
          editor.killToEnd();
          return;
        case 'w':
          editor.deleteWordLeft();
          return;
        case 'left':
          editor.wordLeft();
          return;
        case 'right':
          editor.wordRight();
          return;
        default:
          return;
      }
    }

    if (key.meta) {
      switch (key.name) {
        case 'enter':
          editor.insert('\n');
          return;
        case 'b':
          editor.wordLeft();
          return;
        case 'f':
          editor.wordRight();
          return;
        case 'backspace':
          editor.deleteWordLeft();
          return;
        default:
          return;
      }
    }

    const commands = this._commandMenu();
    if (commands) {
      const selected = commands[this._commandIndex];
      switch (key.name) {
        case 'up':
          this._commandIndex =
            (this._commandIndex + commands.length - 1) % commands.length;
          return;
        case 'down':
          this._commandIndex = (this._commandIndex + 1) % commands.length;
          return;
        case 'tab':
          this._completeCommand(selected, ' ');
          return;
        case 'enter':
          this._completeCommand(selected, '');
          await this._submit();
          return;
        case 'escape':
          this._commandsDismissed = true;
          return;
        default:
          break;
      }
    }

    switch (key.name) {
      case 'enter':
        if (editor.text.endsWith('\\')) {
          editor.backspace();
          editor.insert('\n');
          return;
        }
        await this._submit();
        return;
      case 'escape':
        if (this._mode === 'busy') {
          this._interrupt();
        }
        return;
      case 'backspace':
        editor.backspace();
        return;
      case 'delete':
        editor.delete();
        return;
      case 'left':
        editor.left();
        return;
      case 'right':
        editor.right();
        return;
      case 'home':
        editor.home();
        return;
      case 'end':
        editor.end();
        return;
      case 'up':
        if (!editor.lineUp()) {
          editor.historyPrevious();
        }
        return;
      case 'down':
        if (!editor.lineDown()) {
          editor.historyNext();
        }
        return;
      case 'paste':
        editor.insert(key.text ?? '');
        return;
      case 'tab':
        return;
      default:
        if (key.text) {
          editor.insert(key.text);
        }
    }
  }

  private _handleApprovalKey(key: IKey): void {
    const approval = this._approval;
    if (!approval) {
      this._mode = 'busy';
      return;
    }
    const choices = 3;
    if (key.ctrl && key.name === 'c') {
      this._interrupt();
      return;
    }
    switch (key.name) {
      case 'up':
        approval.selected = (approval.selected + choices - 1) % choices;
        return;
      case 'down':
        approval.selected = (approval.selected + 1) % choices;
        return;
      case 'enter':
        this._resolveApproval(approval.selected);
        return;
      case 'escape':
      case 'n':
      case '3':
        this._resolveApproval(2);
        return;
      case 'y':
      case '1':
        this._resolveApproval(0);
        return;
      case 'a':
      case '2':
        this._resolveApproval(1);
        return;
      default:
        return;
    }
  }

  private _handleMenuKey(key: IKey): void {
    const menu = this._menu;
    if (!menu) {
      this._mode = 'idle';
      return;
    }
    const count = menu.items.length;
    switch (key.name) {
      case 'up':
        menu.selected = (menu.selected + count - 1) % count;
        return;
      case 'down':
        menu.selected = (menu.selected + 1) % count;
        return;
      case 'enter':
        this._menu = undefined;
        this._mode = 'idle';
        menu.onSelect(menu.selected);
        return;
      case 'escape':
        this._menu = undefined;
        this._mode = 'idle';
        return;
      default: {
        const index = parseInt(key.name, 10);
        if (!key.ctrl && !key.meta && index >= 1 && index <= count) {
          this._menu = undefined;
          this._mode = 'idle';
          menu.onSelect(index - 1);
        }
      }
    }
  }

  private _onInterrupt(): void {
    if (this._mode === 'busy') {
      this._interrupt();
      return;
    }
    if (!this._editor.isEmpty) {
      this._editor.clear();
      return;
    }
    const now = Date.now();
    if (now - this._lastCtrlC < CTRL_C_EXIT_WINDOW_MS) {
      this._exit();
      return;
    }
    this._lastCtrlC = now;
    this._hint = 'Press ctrl+c again to exit';
  }

  private _interrupt(): void {
    this._interrupted = true;
    this._agent.stopStreaming();
  }

  private _exit(): void {
    if (this._mode === 'busy' || this._mode === 'approval') {
      this._agent.stopStreaming();
    }
    this._mode = 'done';
  }

  // ---------------------------------------------------------------------
  // Submitting messages and slash commands
  // ---------------------------------------------------------------------

  private async _submit(): Promise<void> {
    const text = this._editor.text.trim();
    if (!text) {
      return;
    }
    this._editor.submit();
    if (text.startsWith('/')) {
      await this._runSlashCommand(text);
      return;
    }
    if (this._mode === 'busy') {
      this._queue.push(text);
      this._hint = `Queued: ${truncate(text, 40)}`;
      return;
    }
    this._send(text);
  }

  private _send(text: string): void {
    this._items.push({ kind: 'user', text });
    this._pending.push('', ...this._renderUser(text));
    this._screen.scrollToBottom();
    this._mode = 'busy';
    this._startedAt = Date.now();
    this._interrupted = false;
    this._activeTool = undefined;
    this._startSpinner();

    const { cwd, initialCwd } = this._session;
    const content =
      cwd !== initialCwd
        ? `(Current working directory: ${cwd})\n\n${text}`
        : text;
    this._agent
      .generateResponse(content)
      .catch(error => this._commitError(String(error)))
      .then(() => this._onResponseDone());
  }

  private _onResponseDone(): void {
    if (this._mode === 'done') {
      return;
    }
    this._finishMessage();
    this._stopSpinner();
    this._mode = 'idle';
    if (this._interrupted) {
      this._interrupted = false;
      this._commitNotice(style.dim + '  ⎿  Interrupted' + style.reset);
    }
    const next = this._queue.shift();
    if (next !== undefined) {
      this._send(next);
    }
    this._render();
  }

  private async _runSlashCommand(line: string): Promise<void> {
    const [command, ...rest] = line.slice(1).split(/\s+/);
    const argument = rest.join(' ');
    this._commitNotice(theme.prompt + '❯ ' + style.reset + line);
    switch (command) {
      case 'help':
        this._commitNotice(
          `${style.bold}Commands${style.reset}`,
          ...SLASH_COMMANDS.map(
            command => `  /${command.name.padEnd(9)} ${command.description}`
          ),
          '',
          `${style.bold}Shortcuts${style.reset}`,
          '  enter          Send the message (end a line with \\ for a newline)',
          '  /              Show the command list, tab or enter picks one',
          '  esc            Interrupt the current response',
          '  ctrl+c         Clear the prompt, twice to exit',
          '  up / down      Browse the prompt history',
          '  pgup / pgdn    Scroll the transcript',
          '  ctrl+l         Redraw the screen'
        );
        return;
      case 'exit':
      case 'quit':
        this._exit();
        return;
      case 'clear':
        await this._agent.clearHistory();
        this._items = [];
        this._pending = [];
        this._screen.clear();
        this._printBanner();
        return;
      case 'model':
        this._selectModel(argument);
        return;
      case 'tools':
        this._commitNotice(
          `${style.bold}Tools${style.reset}`,
          ...Object.keys(this._agent.selectedAgentTools)
            .sort()
            .map(name => `  ${name}`),
          ...(this._session.allowedTools.size > 0
            ? [
                '',
                `${style.bold}Allowed this session${style.reset}`,
                ...[...this._session.allowedTools].map(scope => `  ${scope}`)
              ]
            : [])
        );
        return;
      case 'settings':
        try {
          await this._openSettings();
          this._commitNotice(
            style.dim + '  Opened the AI settings panel.' + style.reset
          );
        } catch (error) {
          this._commitError(`Cannot open the settings: ${String(error)}`);
        }
        return;
      default:
        this._commitNotice(
          theme.warning + `Unknown command /${command}, try /help` + style.reset
        );
    }
  }

  private _selectModel(argument: string): void {
    const providers = this._settingsModel.providers;
    if (providers.length === 0) {
      this._commitNotice(
        theme.warning +
          'No provider is configured, run /settings first.' +
          style.reset
      );
      return;
    }
    const choose = (index: number) => {
      const config = providers[index];
      this._agent.activeProvider = config.id;
      this._commitNotice(
        style.dim +
          `  Switched to ${config.provider} · ${config.model}` +
          style.reset
      );
    };
    if (argument) {
      const needle = argument.toLowerCase();
      const index = providers.findIndex(
        config =>
          config.id === argument ||
          config.name.toLowerCase() === needle ||
          config.model.toLowerCase() === needle
      );
      if (index >= 0) {
        choose(index);
        return;
      }
      this._commitNotice(
        theme.warning + `No provider matches "${argument}"` + style.reset
      );
    }
    const active = this._agent.activeProvider;
    this._menu = {
      title: 'Select a model',
      items: providers.map(config => ({
        label: `${config.provider} · ${config.model}`,
        detail:
          config.id === active
            ? 'active'
            : config.name !== config.model
              ? config.name
              : undefined
      })),
      selected: Math.max(
        0,
        providers.findIndex(config => config.id === active)
      ),
      onSelect: choose
    };
    this._mode = 'select';
  }

  // ---------------------------------------------------------------------
  // Agent events
  // ---------------------------------------------------------------------

  private _onAgentEvent(
    _: IAgentManager,
    event: IAgentManager.IAgentEvent
  ): void {
    if (this._mode === 'done') {
      return;
    }
    switch (event.type) {
      case 'message_start':
        this._finishMessage();
        this._current = {
          kind: 'assistant',
          text: '',
          committed: 0,
          separated: false
        };
        this._items.push(this._current);
        break;
      case 'message_chunk':
        if (this._current) {
          this._current.text = event.data.fullContent;
        }
        break;
      case 'message_complete':
        if (this._current) {
          this._current.text = event.data.content;
        }
        this._finishMessage();
        break;
      case 'tool_call_start': {
        this._finishMessage();
        let args: unknown = event.data.input;
        try {
          args = JSON.parse(event.data.input);
        } catch {
          // Keep the raw input.
        }
        const item: IToolItem = {
          kind: 'tool',
          callId: event.data.callId,
          name: event.data.toolName,
          summary: describeToolCall(event.data.toolName, args),
          args
        };
        this._items.push(item);
        this._toolCalls.set(item.callId, item);
        this._lastToolCallId = item.callId;
        this._activeTool = item.name;
        this._pending.push('', ...this._renderToolCall(item));
        break;
      }
      case 'tool_call_complete': {
        const item = this._toolCalls.get(event.data.callId);
        this._activeTool = undefined;
        if (!item) {
          break;
        }
        item.result = this._summarizeResult(
          item,
          event.data.outputData,
          event.data.isError
        );
        const lines = this._renderToolResult(
          item,
          this._lastToolCallId !== item.callId
        );
        this._pending.push(...lines);
        break;
      }
      case 'tool_approval_request': {
        const scope = approvalScope(event.data.toolName, event.data.args);
        if (this._session.allowedTools.has(scope)) {
          this._agent.approveToolCall(event.data.toolCallId);
          break;
        }
        this._finishMessage();
        this._stopSpinner();
        this._approval = {
          toolCallId: event.data.toolCallId,
          toolName: event.data.toolName,
          args: event.data.args,
          selected: 0
        };
        this._mode = 'approval';
        break;
      }
      case 'tool_approval_resolved':
        break;
      case 'error':
        this._finishMessage();
        this._commitError(event.data.error.message);
        break;
      default:
        break;
    }
    this._render();
  }

  private _onTokenUsage(): void {
    if (this._mode === 'idle') {
      this._render();
    }
  }

  private _resolveApproval(choice: number): void {
    const approval = this._approval;
    if (!approval) {
      return;
    }
    this._approval = undefined;
    this._mode = 'busy';
    this._startSpinner();
    if (choice === 2) {
      this._agent.rejectToolCall(
        approval.toolCallId,
        'The user declined this tool call.'
      );
      this._pending.push(style.dim + '  ⎿  Declined' + style.reset);
      return;
    }
    if (choice === 1) {
      this._session.allowedTools.add(
        approvalScope(approval.toolName, approval.args)
      );
    }
    this._agent.approveToolCall(approval.toolCallId);
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  private _render(): void {
    if (this._mode === 'done') {
      return;
    }
    const lines: string[] = [];
    let caret: ICaret | undefined;

    if (this._mode === 'busy') {
      const tail = this._streamingTail();
      if (tail.length > 0) {
        lines.push(...tail);
      }
      lines.push('', this._spinnerLine());
    }

    if (this._mode === 'approval' && this._approval) {
      lines.push('', ...this._renderApproval(this._approval));
    } else if (this._mode === 'select' && this._menu) {
      lines.push('', ...this._renderMenu(this._menu));
    } else {
      lines.push('');
      const inputBox = renderInputBox(this._editor, this._width, PLACEHOLDER);
      caret = {
        row: lines.length + inputBox.cursorRow,
        col: inputBox.cursorCol
      };
      lines.push(...inputBox.lines);
      const commands = this._commandMenu();
      if (commands) {
        lines.push(...this._renderCommandMenu(commands));
      }
      lines.push(this._statusLine());
    }

    this._screen.render(this._takePending(), lines, caret);
  }

  private _takePending(): string[] {
    const pending = this._pending;
    this._pending = [];
    return pending;
  }

  private _checkResize(): void {
    const { rows, columns } = this._tty.size;
    const width = Math.max(20, columns - 1);
    if (
      (width !== this._width || rows !== this._rows) &&
      this._mode !== 'done'
    ) {
      this._width = width;
      this._rows = rows;
      this._screen.resize(rows);
      this._redrawAll();
      this._render();
    }
  }

  /**
   * Repaint the whole transcript, for a resize or ctrl+l.
   */
  private _redrawAll(): void {
    this._screen.clear();
    const lines: string[] = [];
    for (const item of this._items) {
      if (item === this._current) {
        const { all, stable } = this._renderStreaming(item);
        item.committed = stable;
        item.separated = all.length > 0;
        if (item.separated) {
          lines.push('', ...all.slice(0, stable));
        }
      } else {
        const rendered = this._renderItem(item);
        if (rendered.length > 0) {
          lines.push('', ...rendered);
        }
      }
    }
    this._pending = lines;
  }

  private _renderItem(item: TranscriptItem): string[] {
    switch (item.kind) {
      case 'text':
        return item.lines.flatMap(line => wrapAnsi(line, this._width));
      case 'banner':
        return box(item.rows, Math.min(this._width, MAX_BANNER_WIDTH));
      case 'user':
        return this._renderUser(item.text);
      case 'assistant':
        return this._decorateAssistant(
          renderBlocks(parseBlocks(item.text), this._width - 2)
        );
      case 'tool':
        return [
          ...this._renderToolCall(item),
          ...(item.result ? this._renderToolResult(item, false) : [])
        ];
      case 'error':
        return wrapAnsi(
          theme.error + '⏺ Error: ' + style.reset + item.text,
          this._width
        );
    }
  }

  private _renderUser(text: string): string[] {
    return text
      .split('\n')
      .flatMap((line, index) =>
        wrapAnsi(
          (index === 0 ? theme.prompt + '❯ ' + style.reset : '  ') +
            renderInline(line),
          this._width
        )
      );
  }

  private _decorateAssistant(lines: string[]): string[] {
    return lines.map((line, index) =>
      index === 0 ? theme.accent + '⏺ ' + style.reset + line : '  ' + line
    );
  }

  private _renderToolCall(item: IToolItem): string[] {
    const head =
      theme.tool + '⏺ ' + style.reset + style.bold + item.name + style.reset;
    const summary = item.summary
      ? style.dim +
        '(' +
        style.reset +
        item.summary +
        style.dim +
        ')' +
        style.reset
      : '';
    return wrapAnsi(head + summary, this._width);
  }

  private _renderToolResult(item: IToolItem, labelled: boolean): string[] {
    const result = item.result ?? [];
    const width = Math.max(10, this._width - 5);
    const rows = result.flatMap(line => wrapAnsi(line, width));
    const out: string[] = [];
    rows.forEach((row, index) => {
      const prefix = index === 0 ? style.dim + '  ⎿  ' + style.reset : '     ';
      out.push(prefix + row);
    });
    if (labelled && out.length > 0) {
      out[0] =
        style.dim +
        '  ⎿  ' +
        style.reset +
        style.bold +
        item.name +
        style.reset +
        style.dim +
        ': ' +
        style.reset +
        rows[0];
    }
    return out;
  }

  /**
   * Lines shown under a tool call once its result is known.
   */
  private _summarizeResult(
    item: IToolItem,
    output: unknown,
    isError: boolean
  ): string[] {
    const record = (
      output && typeof output === 'object' ? output : {}
    ) as Record<string, unknown>;
    if (isError) {
      const text =
        typeof output === 'string'
          ? output
          : String(record.error ?? record.message ?? compactJson(output, 400));
      return this._clipLines(text, MAX_RESULT_LINES).map(
        line => theme.error + line + style.reset
      );
    }
    switch (item.name) {
      case 'shell': {
        const text = String(record.output ?? '').replace(/\s+$/, '');
        const lines = text
          ? this._clipLines(text, MAX_RESULT_LINES)
          : [style.dim + '(no output)' + style.reset];
        if (record.exitCode !== 0 && record.exitCode !== undefined) {
          lines.push(
            theme.warning + `exit code ${record.exitCode}` + style.reset
          );
        }
        return lines;
      }
      case 'read_file':
        return [
          style.dim +
            `Read ${record.lines} line${record.lines === 1 ? '' : 's'}` +
            (record.truncated ? ` of ${record.totalLines}` : '') +
            style.reset
        ];
      case 'write_file':
        return [style.dim + `Wrote ${record.bytes} bytes` + style.reset];
      case 'edit_file': {
        const args = (item.args ?? {}) as Record<string, unknown>;
        const lines = [
          style.dim +
            `Replaced ${record.replacements} occurrence${record.replacements === 1 ? '' : 's'}` +
            style.reset
        ];
        const removed = String(args.old_string ?? '')
          .split('\n')
          .slice(0, 3);
        const added = String(args.new_string ?? '')
          .split('\n')
          .slice(0, 3);
        lines.push(
          ...removed.map(line => theme.error + '- ' + line + style.reset)
        );
        lines.push(
          ...added.map(line => theme.success + '+ ' + line + style.reset)
        );
        return lines;
      }
      case 'list_files': {
        const entries =
          (record.entries as { name: string; type: string }[] | undefined) ??
          [];
        const names = entries.map(entry =>
          entry.type === 'directory' ? entry.name + '/' : entry.name
        );
        return this._clipLines(
          names.length ? names.join('  ') : String(record.output ?? '(empty)'),
          MAX_RESULT_LINES
        );
      }
      default:
        return this._clipLines(
          typeof output === 'string'
            ? output
            : (JSON.stringify(output, null, 1) ?? ''),
          MAX_RESULT_LINES
        );
    }
  }

  private _clipLines(text: string, max: number): string[] {
    const lines = text.split('\n');
    if (lines.length <= max) {
      return lines;
    }
    return [
      ...lines.slice(0, max),
      style.dim + `… +${lines.length - max} lines` + style.reset
    ];
  }

  /**
   * Render the streaming message and count the lines of its finished blocks.
   */
  private _renderStreaming(item: IAssistantItem): {
    all: string[];
    stable: number;
  } {
    const blocks = parseBlocks(item.text);
    const width = this._width - 2;
    const all = this._decorateAssistant(renderBlocks(blocks, width));
    const stable =
      blocks.length > 1
        ? renderBlocks(blocks.slice(0, -1), width).length + 1
        : 0;
    return { all, stable };
  }

  /**
   * Lines of the streaming message that may still change. Lines of finished
   * blocks, and lines that no longer fit on screen, are printed for good.
   */
  private _streamingTail(): string[] {
    const item = this._current;
    if (!item) {
      return [];
    }
    const { all, stable } = this._renderStreaming(item);
    this._separate(item, all);
    if (stable > item.committed) {
      this._pending.push(...all.slice(item.committed, stable));
      item.committed = stable;
    }
    let tail = all.slice(item.committed);
    const maxTail = Math.max(3, this._tty.size.rows - 10);
    if (tail.length > maxTail) {
      const overflow = tail.length - maxTail;
      this._pending.push(...tail.slice(0, overflow));
      item.committed += overflow;
      tail = tail.slice(overflow);
    }
    return tail;
  }

  private _finishMessage(): void {
    const item = this._current;
    if (!item) {
      return;
    }
    this._current = undefined;
    const { all } = this._renderStreaming(item);
    this._separate(item, all);
    this._pending.push(...all.slice(item.committed));
    item.committed = all.length;
  }

  /**
   * Print the blank line before a message once it has content.
   */
  private _separate(item: IAssistantItem, lines: string[]): void {
    if (!item.separated && lines.length > 0) {
      item.separated = true;
      this._pending.push('');
    }
  }

  private _spinnerLine(): string {
    const frame = SPINNER_FRAMES[this._frame % SPINNER_FRAMES.length];
    const elapsed = Math.round((Date.now() - this._startedAt) / 1000);
    const verb = this._activeTool ? `Running ${this._activeTool}` : 'Thinking';
    return truncate(
      theme.accent +
        frame +
        style.reset +
        ' ' +
        verb +
        '… ' +
        style.dim +
        `(${elapsed}s · esc to interrupt)` +
        style.reset,
      this._width
    );
  }

  private _statusLine(): string {
    const scrolled = this._screen.scrollOffset;
    const hint =
      this._hint ??
      (this._commandMenu()
        ? '↑↓ select · tab complete · enter run · esc close'
        : scrolled > 0
          ? `↑ ${scrolled} lines · pgdn or end to follow`
          : this._mode === 'busy'
            ? 'esc to interrupt'
            : '/help for commands · ctrl+c twice to exit');
    const usage = this._agent.tokenUsage;
    const tokens = usage.inputTokens + usage.outputTokens;
    const right =
      this._providerLabel() +
      (tokens > 0 ? ` · ${formatTokens(tokens)} tokens` : '');
    const gap = this._width - 2 - visibleWidth(hint) - visibleWidth(right);
    if (gap < 1) {
      return truncate(style.dim + '  ' + hint + style.reset, this._width);
    }
    return style.dim + '  ' + hint + ' '.repeat(gap) + right + style.reset;
  }

  private _providerLabel(): string {
    const config = this._settingsModel.getProvider(this._agent.activeProvider);
    if (!config) {
      return 'no model';
    }
    const info = this._providerRegistry?.getProviderInfo(config.provider);
    return `${info?.name ?? config.provider} · ${config.model}`;
  }

  /**
   * Lines describing what a tool call is about to do.
   */
  private _approvalPreview(approval: IApproval, width: number): string[] {
    const input = (approval.args ?? {}) as Record<string, unknown>;
    const clip = (text: string, max: number) =>
      this._clipLines(text.replace(/\n$/, ''), max);
    switch (approval.toolName) {
      case 'write_file':
        return [
          String(input.path ?? ''),
          '',
          ...clip(String(input.content ?? ''), 12).map(
            line => theme.success + '+ ' + style.reset + line
          )
        ];
      case 'edit_file':
        return [
          String(input.path ?? ''),
          '',
          ...clip(String(input.old_string ?? ''), 8).map(
            line => theme.error + '- ' + style.reset + line
          ),
          ...clip(String(input.new_string ?? ''), 8).map(
            line => theme.success + '+ ' + style.reset + line
          )
        ];
      default: {
        const detail =
          describeToolCall(approval.toolName, approval.args) ||
          compactJson(approval.args, 300);
        return wrapAnsi(detail, width - 4).slice(0, 8);
      }
    }
  }

  private _renderApproval(approval: IApproval): string[] {
    const width = Math.min(this._width, 100);
    const rows = [
      ...this._approvalPreview(approval, width),
      '',
      ...[
        'Yes',
        `Yes, and don't ask again for ${approvalScope(approval.toolName, approval.args).replace(/^execute_command:/, '')} this session`,
        'No'
      ].map((label, index) =>
        index === approval.selected
          ? theme.accent +
            '❯ ' +
            style.reset +
            style.bold +
            `${index + 1}. ${label}` +
            style.reset
          : `  ${index + 1}. ${label}`
      )
    ];
    return [
      ...box(
        rows,
        width,
        `Allow ${style.bold}${approval.toolName}${style.reset}?`
      ),
      style.dim + '  ↑↓ select · enter confirm · esc deny' + style.reset
    ];
  }

  /**
   * The slash commands matching the prompt, while it is a single word that
   * starts with a slash and the list was not dismissed.
   */
  private _commandMenu(): ISlashCommand[] | undefined {
    const text = this._editor.text;
    if (text !== this._commandText) {
      this._commandText = text;
      this._commandIndex = 0;
      this._commandsDismissed = false;
    }
    if (this._commandsDismissed || !text.startsWith('/') || /\s/.test(text)) {
      return undefined;
    }
    const prefix = text.slice(1);
    const commands = SLASH_COMMANDS.filter(command =>
      command.name.startsWith(prefix)
    );
    if (commands.length === 0) {
      return undefined;
    }
    this._commandIndex = Math.min(this._commandIndex, commands.length - 1);
    return commands;
  }

  private _renderCommandMenu(commands: ISlashCommand[]): string[] {
    const column =
      Math.max(...commands.map(command => command.name.length)) + 3;
    return commands.map((command, index) => {
      const name = `/${command.name}`.padEnd(column);
      const line =
        index === this._commandIndex
          ? theme.accent +
            '  ❯ ' +
            style.reset +
            style.bold +
            name +
            style.reset
          : '    ' + name;
      return truncate(
        line + style.dim + command.description + style.reset,
        this._width
      );
    });
  }

  /**
   * Put a command in the prompt, followed by `suffix`.
   */
  private _completeCommand(command: ISlashCommand, suffix: string): void {
    this._editor.text = `/${command.name}${suffix}`;
    this._editor.cursor = this._editor.text.length;
  }

  private _renderMenu(menu: IMenu): string[] {
    const width = Math.min(this._width, 100);
    const rows = menu.items.map((item, index) => {
      const label =
        index === menu.selected
          ? theme.accent +
            '❯ ' +
            style.reset +
            style.bold +
            item.label +
            style.reset
          : '  ' + item.label;
      return (
        label +
        (item.detail ? style.dim + `  (${item.detail})` + style.reset : '')
      );
    });
    return [
      ...box(rows, width, menu.title),
      style.dim + '  ↑↓ select · enter confirm · esc cancel' + style.reset
    ];
  }

  private _printBanner(): void {
    const width = Math.min(this._width, MAX_BANNER_WIDTH);
    const rows = [
      theme.accent +
        '✻ ' +
        style.reset +
        style.bold +
        'Welcome to Jupyternaut!' +
        style.reset,
      '',
      style.dim + '  model  ' + style.reset + this._providerLabel(),
      style.dim + '  cwd    ' + style.reset + this._session.cwd,
      '',
      style.dim +
        '  /help for commands · esc to interrupt · /exit to leave' +
        style.reset
    ];
    this._items.push({ kind: 'banner', rows });
    this._pending.push('', ...box(rows, width));
  }

  private _commitNotice(...lines: string[]): void {
    this._items.push({ kind: 'text', lines });
    this._pending.push(
      '',
      ...lines.flatMap(line => wrapAnsi(line, this._width))
    );
  }

  private _commitError(text: string): void {
    this._items.push({ kind: 'error', text });
    this._pending.push(
      '',
      ...wrapAnsi(theme.error + '⏺ Error: ' + style.reset + text, this._width)
    );
  }

  private _startSpinner(): void {
    if (this._spinnerTimer !== undefined) {
      return;
    }
    this._spinnerTimer = setInterval(() => {
      this._frame++;
      this._render();
    }, SPINNER_INTERVAL_MS);
  }

  private _stopSpinner(): void {
    if (this._spinnerTimer !== undefined) {
      clearInterval(this._spinnerTimer);
      this._spinnerTimer = undefined;
    }
  }

  private _tty: Tty;
  private _session: TerminalSession;
  private _agent: IAgentManager;
  private _settingsModel: IAISettingsModel;
  private _providerRegistry?: IProviderRegistry;
  private _isDarkMode: () => boolean;
  private _openSettings: () => Promise<unknown>;
  private _screen: Screen;
  private _editor = new LineEditor();
  private _mode: Mode = 'idle';
  private _width = 80;
  private _rows = 24;
  private _items: TranscriptItem[] = [];
  private _pending: string[] = [];
  private _current?: IAssistantItem;
  private _toolCalls = new Map<string, IToolItem>();
  private _lastToolCallId?: string;
  private _activeTool?: string;
  private _approval?: IApproval;
  private _menu?: IMenu;
  private _commandText = '';
  private _commandIndex = 0;
  private _commandsDismissed = false;
  private _queue: string[] = [];
  private _hint?: string;
  private _interrupted = false;
  private _lastCtrlC = 0;
  private _startedAt = 0;
  private _frame = 0;
  private _spinnerTimer?: ReturnType<typeof setInterval>;
  private _resizeTimer?: ReturnType<typeof setInterval>;
}
