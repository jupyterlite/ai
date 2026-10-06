import type { IExternalRunContext, Termios } from '@jupyterlite/cockle';

import { type IKey, parseKeys } from './keys';

export interface ISize {
  rows: number;
  columns: number;
}

/**
 * Termios flag bits, matching the values used by cockle (and Linux).
 */
const ICRNL = 0x0100;
const INLCR = 0x0040;
const IGNCR = 0x0080;
const IXON = 0x0400;
const ISIG = 0x0001;
const ICANON = 0x0002;
const ECHO = 0x0008;
const ECHONL = 0x0040;
const IEXTEN = 0x8000;

const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';
const SHOW_CURSOR = '\x1b[?25h';

/**
 * Raw keyboard input and output for an external cockle command.
 */
export class Tty {
  constructor(context: IExternalRunContext) {
    this._context = context;
  }

  get size(): ISize {
    const { rows, columns } = this._context.size();
    return { rows: rows || 24, columns: columns || 80 };
  }

  write(text: string): void {
    this._context.stdout.write(text);
  }

  /**
   * Disable line buffering, echo and signal characters so every key press is
   * delivered as-is. Output post-processing (`\n` to `\r\n`) is kept.
   */
  enterRawMode(): void {
    const { termios } = this._context;
    this._saved = cloneFlags(termios.get());
    const flags = cloneFlags(this._saved);
    flags.c_iflag &= ~(ICRNL | INLCR | IGNCR | IXON);
    flags.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
    termios.set(flags);
    this.write(ENABLE_BRACKETED_PASTE);
  }

  restore(): void {
    this.write(DISABLE_BRACKETED_PASTE + SHOW_CURSOR);
    if (this._saved) {
      this._context.termios.set(this._saved);
      this._saved = undefined;
    }
  }

  /**
   * Decoded keys, as they arrive from the terminal.
   */
  async *keys(): AsyncGenerator<IKey> {
    for (;;) {
      const chunk = await this._context.stdin.readAsync(null);
      if (!chunk) {
        await new Promise(resolve => setTimeout(resolve, 20));
        continue;
      }
      for (const key of parseKeys(chunk)) {
        yield key;
      }
    }
  }

  private _context: IExternalRunContext;
  private _saved?: Termios.IFlags;
}

function cloneFlags(flags: Termios.IFlags): Termios.IFlags {
  return { ...flags, c_cc: [...flags.c_cc] };
}
