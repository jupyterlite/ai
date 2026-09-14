import { padEnd, style, truncate, visibleWidth } from '../render/ansi';

/**
 * Top border of a rounded box, with an optional title.
 */
export function boxTop(width: number, title?: string): string {
  const inner = Math.max(0, width - 2);
  if (!title) {
    return style.dim + '╭' + '─'.repeat(inner) + '╮' + style.reset;
  }
  const label = ' ' + title + ' ';
  const rest = Math.max(0, inner - 1 - visibleWidth(label));
  return (
    style.dim +
    '╭─' +
    style.reset +
    label +
    style.dim +
    '─'.repeat(rest) +
    '╮' +
    style.reset
  );
}

export function boxRow(content: string, width: number): string {
  const inner = Math.max(0, width - 4);
  return (
    style.dim +
    '│ ' +
    style.reset +
    padEnd(truncate(content, inner), inner) +
    style.dim +
    ' │' +
    style.reset
  );
}

export function boxBottom(width: number): string {
  return (
    style.dim + '╰' + '─'.repeat(Math.max(0, width - 2)) + '╯' + style.reset
  );
}

export function box(rows: string[], width: number, title?: string): string[] {
  return [
    boxTop(width, title),
    ...rows.map(row => boxRow(row, width)),
    boxBottom(width)
  ];
}
