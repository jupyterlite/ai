import { charWidth, style, theme } from '../render/ansi';
import { boxBottom, boxTop } from './box';

/**
 * Editable text buffer with cursor movement and history.
 */
export class LineEditor {
  text = '';
  cursor = 0;

  get isEmpty(): boolean {
    return this.text.length === 0;
  }

  insert(value: string): void {
    this.text =
      this.text.slice(0, this.cursor) + value + this.text.slice(this.cursor);
    this.cursor += value.length;
  }

  backspace(): void {
    if (this.cursor === 0) {
      return;
    }
    const step = this._isLowSurrogate(this.cursor - 1) ? 2 : 1;
    this.text =
      this.text.slice(0, this.cursor - step) + this.text.slice(this.cursor);
    this.cursor -= step;
  }

  delete(): void {
    if (this.cursor >= this.text.length) {
      return;
    }
    const step = this._isHighSurrogate(this.cursor) ? 2 : 1;
    this.text =
      this.text.slice(0, this.cursor) + this.text.slice(this.cursor + step);
  }

  left(): void {
    if (this.cursor > 0) {
      this.cursor -= this._isLowSurrogate(this.cursor - 1) ? 2 : 1;
    }
  }

  right(): void {
    if (this.cursor < this.text.length) {
      this.cursor += this._isHighSurrogate(this.cursor) ? 2 : 1;
    }
  }

  home(): void {
    this.cursor = this.text.lastIndexOf('\n', this.cursor - 1) + 1;
  }

  end(): void {
    const next = this.text.indexOf('\n', this.cursor);
    this.cursor = next === -1 ? this.text.length : next;
  }

  wordLeft(): void {
    let i = this.cursor;
    while (i > 0 && /\s/.test(this.text[i - 1])) {
      i--;
    }
    while (i > 0 && !/\s/.test(this.text[i - 1])) {
      i--;
    }
    this.cursor = i;
  }

  wordRight(): void {
    let i = this.cursor;
    const n = this.text.length;
    while (i < n && /\s/.test(this.text[i])) {
      i++;
    }
    while (i < n && !/\s/.test(this.text[i])) {
      i++;
    }
    this.cursor = i;
  }

  deleteWordLeft(): void {
    const end = this.cursor;
    this.wordLeft();
    this.text = this.text.slice(0, this.cursor) + this.text.slice(end);
  }

  killToEnd(): void {
    this.text = this.text.slice(0, this.cursor);
  }

  killToStart(): void {
    this.text = this.text.slice(this.cursor);
    this.cursor = 0;
  }

  /**
   * Line of the cursor and its column within that line.
   */
  get position(): { line: number; column: number } {
    const before = this.text.slice(0, this.cursor);
    const line = before.split('\n').length - 1;
    const column = before.length - (before.lastIndexOf('\n') + 1);
    return { line, column };
  }

  get lineCount(): number {
    return this.text.split('\n').length;
  }

  /**
   * Move the cursor to the previous line, keeping the column when possible.
   */
  lineUp(): boolean {
    const { line, column } = this.position;
    if (line === 0) {
      return false;
    }
    const lines = this.text.split('\n');
    const target = Math.min(column, lines[line - 1].length);
    this.cursor =
      lines.slice(0, line - 1).reduce((acc, l) => acc + l.length + 1, 0) +
      target;
    return true;
  }

  lineDown(): boolean {
    const { line, column } = this.position;
    const lines = this.text.split('\n');
    if (line >= lines.length - 1) {
      return false;
    }
    const target = Math.min(column, lines[line + 1].length);
    this.cursor =
      lines.slice(0, line + 1).reduce((acc, l) => acc + l.length + 1, 0) +
      target;
    return true;
  }

  historyPrevious(): boolean {
    if (this._history.length === 0) {
      return false;
    }
    if (this._historyIndex === -1) {
      this._draft = this.text;
      this._historyIndex = this._history.length - 1;
    } else if (this._historyIndex > 0) {
      this._historyIndex--;
    } else {
      return true;
    }
    this._setText(this._history[this._historyIndex]);
    return true;
  }

  historyNext(): boolean {
    if (this._historyIndex === -1) {
      return false;
    }
    this._historyIndex++;
    if (this._historyIndex >= this._history.length) {
      this._historyIndex = -1;
      this._setText(this._draft);
    } else {
      this._setText(this._history[this._historyIndex]);
    }
    return true;
  }

  /**
   * Return the text, record it in the history and reset the editor.
   */
  submit(): string {
    const text = this.text;
    if (text.trim() && this._history[this._history.length - 1] !== text) {
      this._history.push(text);
    }
    this.clear();
    return text;
  }

  clear(): void {
    this.text = '';
    this.cursor = 0;
    this._historyIndex = -1;
    this._draft = '';
  }

  private _setText(text: string): void {
    this.text = text;
    this.cursor = text.length;
  }

  private _isLowSurrogate(index: number): boolean {
    const code = this.text.charCodeAt(index);
    return code >= 0xdc00 && code <= 0xdfff;
  }

  private _isHighSurrogate(index: number): boolean {
    const code = this.text.charCodeAt(index);
    return code >= 0xd800 && code <= 0xdbff;
  }

  private _history: string[] = [];
  private _historyIndex = -1;
  private _draft = '';
}

export interface IInputBox {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
}

interface IVisualRow {
  text: string;
  start: number;
  first: boolean;
}

/**
 * Split one logical line into rows of at most `width` columns, remembering
 * the offset of each row so the cursor can be located.
 */
function visualRows(line: string, width: number, offset: number): IVisualRow[] {
  const rows: IVisualRow[] = [];
  let current = '';
  let used = 0;
  let start = offset;
  let index = 0;
  for (const ch of line) {
    const w = charWidth(ch.codePointAt(0)!);
    if (used + w > width && used > 0) {
      rows.push({ text: current, start, first: rows.length === 0 });
      current = '';
      used = 0;
      start = offset + index;
    }
    current += ch;
    used += w;
    index += ch.length;
  }
  rows.push({ text: current, start, first: rows.length === 0 });
  return rows;
}

/**
 * Draw the prompt box and locate the caret inside it.
 */
export function renderInputBox(
  editor: LineEditor,
  width: number,
  placeholder: string
): IInputBox {
  const textWidth = Math.max(4, width - 6);
  const lines: string[] = [boxTop(width)];
  let cursorRow = 1;
  let cursorCol = 4;

  if (editor.isEmpty) {
    const hint = placeholder.slice(0, textWidth);
    lines.push(
      style.dim +
        '│ ' +
        style.reset +
        theme.prompt +
        '> ' +
        style.reset +
        style.dim +
        hint +
        style.reset
    );
    lines[1] +=
      ' '.repeat(Math.max(0, textWidth - hint.length)) +
      style.dim +
      ' │' +
      style.reset;
  } else {
    let offset = 0;
    for (const logical of editor.text.split('\n')) {
      for (const row of visualRows(logical, textWidth, offset)) {
        const rowIndex = lines.length;
        const end = row.start + row.text.length;
        const holdsCursor =
          editor.cursor >= row.start &&
          (editor.cursor < end ||
            (editor.cursor === end && end === offset + logical.length));
        if (holdsCursor) {
          cursorRow = rowIndex;
          cursorCol = 4;
          for (const ch of row.text.slice(0, editor.cursor - row.start)) {
            cursorCol += charWidth(ch.codePointAt(0)!);
          }
        }
        const prefix = row.first ? theme.prompt + '> ' + style.reset : '  ';
        let used = 0;
        for (const ch of row.text) {
          used += charWidth(ch.codePointAt(0)!);
        }
        lines.push(
          style.dim +
            '│ ' +
            style.reset +
            prefix +
            row.text +
            ' '.repeat(Math.max(0, textWidth - used)) +
            style.dim +
            ' │' +
            style.reset
        );
      }
      offset += logical.length + 1;
    }
  }
  lines.push(boxBottom(width));
  return { lines, cursorRow, cursorCol };
}
