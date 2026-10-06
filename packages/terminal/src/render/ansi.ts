const CSI = '\x1b[';

export const style = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  inverse: `${CSI}7m`,
  strike: `${CSI}9m`
};

export function fg(index: number): string {
  return `${CSI}38;5;${index}m`;
}

/**
 * 256-color palette entries chosen to stay readable on light and dark terminals.
 */
export const theme = {
  accent: fg(68),
  prompt: fg(75),
  tool: fg(68),
  success: fg(71),
  warning: fg(179),
  error: fg(167),
  inlineCode: fg(173),
  heading: fg(68),
  link: fg(68),
  quote: fg(245),
  codeBackground: `${CSI}48;5;236m`
};

/**
 * Pick background shades that fit a light or dark terminal.
 */
export function setDarkMode(dark: boolean): void {
  theme.codeBackground = `${CSI}48;5;${dark ? 236 : 254}m`;
  theme.quote = fg(dark ? 245 : 243);
}

export const cursor = {
  up: (n: number): string => (n > 0 ? `${CSI}${n}A` : ''),
  down: (n: number): string => (n > 0 ? `${CSI}${n}B` : ''),
  column: (col: number): string => `${CSI}${col + 1}G`,
  to: (row: number, col: number): string => `${CSI}${row + 1};${col + 1}H`,
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  eraseDown: `${CSI}J`,
  eraseEndLine: `${CSI}K`,
  clearScreen: `${CSI}2J${CSI}H`
};

// eslint-disable-next-line no-control-regex
const SGR_RE = /\x1b\[[0-9;]*m/g;
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/**
 * Display width of a code point (0 for combining marks, 2 for wide CJK).
 */
export function charWidth(cp: number): number {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) {
    return 0;
  }
  if (
    (cp >= 0x300 && cp <= 0x36f) ||
    cp === 0x200b ||
    cp === 0x200d ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  ) {
    return 0;
  }
  if (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
  ) {
    return 2;
  }
  return 1;
}

export function visibleWidth(text: string): number {
  let width = 0;
  for (const ch of stripAnsi(text)) {
    width += charWidth(ch.codePointAt(0)!);
  }
  return width;
}

/**
 * Cut a styled line to `width` columns, appending an ellipsis when needed.
 */
export function truncate(text: string, width: number): string {
  if (visibleWidth(text) <= width) {
    return text;
  }
  const target = Math.max(0, width - 1);
  let out = '';
  let used = 0;
  let active = false;
  for (const part of split(text)) {
    if (part.startsWith('\x1b')) {
      out += part;
      active = part !== style.reset;
      continue;
    }
    const w = charWidth(part.codePointAt(0)!);
    if (used + w > target) {
      break;
    }
    out += part;
    used += w;
  }
  return out + '…' + (active ? style.reset : '');
}

export function padEnd(text: string, width: number): string {
  const missing = width - visibleWidth(text);
  return missing > 0 ? text + ' '.repeat(missing) : text;
}

/**
 * Split a styled string into SGR sequences and single code points.
 */
function* split(text: string): Generator<string> {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\x1b') {
      const m = SGR_RE.exec(text.slice(i));
      SGR_RE.lastIndex = 0;
      if (m && m.index === 0) {
        yield m[0];
        i += m[0].length;
        continue;
      }
    }
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    yield ch;
    i += ch.length;
  }
}

/**
 * Word-wrap a styled line into rows of at most `width` columns, keeping the
 * active styles across row breaks.
 */
export function wrapAnsi(line: string, width: number): string[] {
  if (width <= 0) {
    return [line];
  }
  const rows: string[] = [];
  let active: string[] = [];
  let current = '';
  let used = 0;

  const flush = () => {
    rows.push(current + (active.length ? style.reset : ''));
    current = active.join('');
    used = 0;
  };

  // eslint-disable-next-line no-control-regex
  for (const token of line.split(/(\x1b\[[0-9;]*m| )/)) {
    if (token === '') {
      continue;
    }
    if (token.startsWith('\x1b')) {
      current += token;
      active = token === style.reset ? [] : [...active, token];
      continue;
    }
    if (token === ' ') {
      if (used + 1 > width) {
        if (used > 0) {
          flush();
        }
      } else {
        current += ' ';
        used += 1;
      }
      continue;
    }
    const w = visibleWidth(token);
    if (used + w <= width) {
      current += token;
      used += w;
      continue;
    }
    if (used > 0 && w <= width) {
      flush();
      current += token;
      used = w;
      continue;
    }
    for (const ch of token) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (used + cw > width && used > 0) {
        flush();
      }
      current += ch;
      used += cw;
    }
  }
  rows.push(current);
  return rows;
}
