import { cursor } from './ansi';

export interface ICaret {
  row: number;
  col: number;
}

const MAX_HISTORY_LINES = 5000;
const ENTER_ALTERNATE_SCREEN = '\x1b[?1049h';
const LEAVE_ALTERNATE_SCREEN = '\x1b[?1049l';
const ENABLE_MOUSE = '\x1b[?1000h\x1b[?1006h';
const DISABLE_MOUSE = '\x1b[?1006l\x1b[?1000l';

/**
 * Renderer of the transcript in the alternate screen buffer. Static lines are
 * kept in a scrollable history, the dynamic region (spinner, prompt, menus)
 * is redrawn at the bottom.
 */
export class Screen {
  constructor(write: (text: string) => void, rows: number) {
    this._write = write;
    this._rows = Math.max(1, rows);
  }

  /**
   * Lines the transcript is scrolled up by, 0 when following the output.
   */
  get scrollOffset(): number {
    return this._scroll;
  }

  enter(): void {
    this._write(ENTER_ALTERNATE_SCREEN + ENABLE_MOUSE + cursor.clearScreen);
    this._previous = [];
  }

  /**
   * Leave the alternate screen and print the transcript, so it stays in the
   * terminal scrollback.
   */
  exit(): void {
    this._write(
      cursor.show +
        DISABLE_MOUSE +
        LEAVE_ALTERNATE_SCREEN +
        this._history.map(line => line + '\n').join('')
    );
  }

  /**
   * Add `staticLines` to the transcript, redraw `dynamicLines` and place the
   * caret. All lines must already be wrapped to the terminal width.
   */
  render(staticLines: string[], dynamicLines: string[], caret?: ICaret): void {
    if (staticLines.length > 0) {
      this._history.push(...staticLines);
      if (this._scroll > 0) {
        // Keep the same lines in view while the transcript grows.
        this._scroll += staticLines.length;
      }
      const overflow = this._history.length - MAX_HISTORY_LINES;
      if (overflow > 0) {
        this._history.splice(0, overflow);
      }
    }
    this._dynamic = dynamicLines;
    this._caret = caret;
    this._clampScroll();
    this._paint();
  }

  clear(): void {
    this._history = [];
    this._previous = [];
    this._dynamic = [];
    this._scroll = 0;
    this._write(cursor.clearScreen);
  }

  resize(rows: number): void {
    this._rows = Math.max(1, rows);
    this._previous = [];
    this._clampScroll();
  }

  scrollBy(lines: number): void {
    this._scroll += lines;
    this._clampScroll();
    this._paint();
  }

  scrollToBottom(): void {
    this._scroll = 0;
    this._paint();
  }

  /**
   * Number of rows available for the transcript above the dynamic region.
   */
  private get _transcriptRows(): number {
    return Math.max(0, this._rows - Math.min(this._dynamic.length, this._rows));
  }

  private _clampScroll(): void {
    const max = Math.max(0, this._history.length - this._transcriptRows);
    this._scroll = Math.min(Math.max(0, this._scroll), max);
  }

  /**
   * Redraw the rows that changed since the last paint.
   */
  private _paint(): void {
    const rows = this._rows;
    const bottom = this._dynamic.slice(-rows);
    const topCount = rows - bottom.length;
    const end = this._history.length - this._scroll;
    const top = this._history.slice(Math.max(0, end - topCount), end);
    const frame = [
      ...new Array<string>(Math.max(0, topCount - top.length)).fill(''),
      ...top,
      ...bottom
    ];

    let out = cursor.hide;
    for (let row = 0; row < rows; row++) {
      const line = frame[row] ?? '';
      if (this._previous[row] !== line) {
        out += cursor.to(row, 0) + line + cursor.eraseEndLine;
      }
    }
    this._previous = frame;

    const caret = this._caret;
    if (caret && bottom.length > 0) {
      const row =
        topCount + Math.min(Math.max(0, caret.row), bottom.length - 1);
      out += cursor.to(row, caret.col) + cursor.show;
    }
    this._write(out);
  }

  private _write: (text: string) => void;
  private _rows: number;
  private _history: string[] = [];
  private _dynamic: string[] = [];
  private _previous: string[] = [];
  private _caret?: ICaret;
  private _scroll = 0;
}
