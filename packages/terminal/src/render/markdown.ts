import { padEnd, style, theme, truncate, visibleWidth, wrapAnsi } from './ansi';

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'code'
  | 'list'
  | 'quote'
  | 'hr'
  | 'table';

/**
 * A block-level markdown element. Only the last block of a streaming
 * message can still change, which lets earlier blocks be printed for good.
 */
export interface IBlock {
  type: BlockType;
  lines: string[];
  level?: number;
  lang?: string;
}

const FENCE_RE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const FENCE_END_RE = /^\s*(`{3,}|~{3,})\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)/;

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function startsBlock(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    FENCE_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    LIST_RE.test(line)
  );
}

/**
 * Split markdown into block-level elements.
 */
export function parseBlocks(markdown: string): IBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: IBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const minLength = fence[1].length;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const end = FENCE_END_RE.exec(lines[i]);
        if (end && end[1][0] === marker && end[1].length >= minLength) {
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lines: body, lang: fence[2] || undefined });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        lines: [heading[2]]
      });
      i++;
      continue;
    }
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr', lines: [] });
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(QUOTE_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ type: 'quote', lines: body });
      continue;
    }
    if (LIST_RE.test(line)) {
      const body = [line];
      i++;
      while (
        i < lines.length &&
        !isBlank(lines[i]) &&
        (LIST_RE.test(lines[i]) || /^\s+/.test(lines[i]))
      ) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'list', lines: body });
      continue;
    }
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEP_RE.test(lines[i + 1])
    ) {
      const body = [line];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'table', lines: body });
      continue;
    }
    const body = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
      body.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', lines: body });
  }
  return blocks;
}

/**
 * Render inline markdown (emphasis, code spans, links) to a styled string.
 *
 * `outer` holds the styles of the enclosing element so they can be restored
 * after a nested reset.
 */
export function renderInline(text: string, outer = ''): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < n) {
      out += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        out += theme.inlineCode + text.slice(i + 1, end) + style.reset + outer;
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const marker = text.slice(i, i + 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 2) {
        const inner = outer + style.bold;
        out +=
          style.bold +
          renderInline(text.slice(i + 2, end), inner) +
          style.reset +
          outer;
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith('~~', i)) {
      const end = text.indexOf('~~', i + 2);
      if (end > i + 2) {
        const inner = outer + style.strike;
        out +=
          style.strike +
          renderInline(text.slice(i + 2, end), inner) +
          style.reset +
          outer;
        i = end + 2;
        continue;
      }
    }
    if (
      (ch === '*' || ch === '_') &&
      i + 1 < n &&
      text[i + 1] !== ' ' &&
      text[i + 1] !== ch &&
      (ch === '*' || i === 0 || !/\w/.test(text[i - 1]))
    ) {
      const end = text.indexOf(ch, i + 1);
      if (
        end > i + 1 &&
        (ch === '*' || end + 1 >= n || !/\w/.test(text[end + 1]))
      ) {
        const inner = outer + style.italic;
        out +=
          style.italic +
          renderInline(text.slice(i + 1, end), inner) +
          style.reset +
          outer;
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const link = LINK_RE.exec(text.slice(i));
      if (link) {
        const inner = outer + style.underline + theme.link;
        out +=
          style.underline +
          theme.link +
          renderInline(link[1], inner) +
          style.reset +
          outer;
        if (link[2] !== link[1]) {
          out += style.dim + ' (' + link[2] + ')' + style.reset + outer;
        }
        i += link[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

function renderCode(block: IBlock, width: number): string[] {
  const inner = Math.max(1, width - 2);
  const rows: string[] = [];
  for (const line of block.lines) {
    const expanded = line.replace(/\t/g, '    ');
    for (const chunk of hardWrap(expanded, inner)) {
      rows.push(
        ' ' + theme.codeBackground + padEnd(chunk, inner) + style.reset
      );
    }
  }
  if (rows.length === 0) {
    rows.push(' ' + theme.codeBackground + ' '.repeat(inner) + style.reset);
  }
  return rows;
}

function hardWrap(text: string, width: number): string[] {
  const rows: string[] = [];
  let current = '';
  let used = 0;
  for (const ch of text) {
    const w = visibleWidth(ch);
    if (used + w > width && used > 0) {
      rows.push(current);
      current = '';
      used = 0;
    }
    current += ch;
    used += w;
  }
  rows.push(current);
  return rows;
}

function renderList(lines: string[], width: number): string[] {
  interface IItem {
    indent: number;
    marker: string;
    text: string[];
  }
  const items: IItem[] = [];
  for (const line of lines) {
    const match = LIST_RE.exec(line);
    if (match) {
      items.push({
        indent: match[1].replace(/\t/g, '  ').length,
        marker: match[2],
        text: [match[3]]
      });
    } else if (items.length > 0) {
      items[items.length - 1].text.push(line.trim());
    }
  }
  const baseIndent = items.length > 0 ? items[0].indent : 0;
  const bullets = ['•', '◦', '▪'];
  const rows: string[] = [];
  for (const item of items) {
    const level = Math.max(0, Math.floor((item.indent - baseIndent) / 2));
    const ordered = /\d/.test(item.marker);
    const bullet = ordered ? item.marker.replace(')', '.') : bullets[level % 3];
    const prefix = '  '.repeat(level) + bullet + ' ';
    const continuation = ' '.repeat(visibleWidth(prefix));
    const wrapped = wrapAnsi(
      renderInline(item.text.join(' ')),
      Math.max(1, width - visibleWidth(prefix))
    );
    wrapped.forEach((row, index) => {
      rows.push((index === 0 ? prefix : continuation) + row);
    });
  }
  return rows;
}

function splitRow(line: string): string[] {
  const cells = line
    .split(/(?<!\\)\|/)
    .map(cell => cell.replace(/\\\|/g, '|').trim());
  if (cells.length > 0 && cells[0] === '') {
    cells.shift();
  }
  if (cells.length > 0 && cells[cells.length - 1] === '') {
    cells.pop();
  }
  return cells;
}

function renderTable(lines: string[], width: number): string[] {
  const rows = lines.map(splitRow);
  const columns = Math.max(...rows.map(row => row.length));
  const widths: number[] = [];
  for (let c = 0; c < columns; c++) {
    const widest = Math.max(
      ...rows.map(row => visibleWidth(renderInline(row[c] ?? '')))
    );
    widths.push(Math.min(40, Math.max(1, widest)));
  }
  const renderRow = (row: string[], bold: boolean): string =>
    widths
      .map((w, c) => {
        const prefix = bold ? style.bold : '';
        const cell = prefix + renderInline(row[c] ?? '', prefix) + style.reset;
        return padEnd(truncate(cell, w), w);
      })
      .join(' │ ');
  const out = [
    renderRow(rows[0], true),
    style.dim + widths.map(w => '─'.repeat(w)).join('─┼─') + style.reset
  ];
  for (const row of rows.slice(1)) {
    out.push(renderRow(row, false));
  }
  return out.map(row => truncate(row, width));
}

/**
 * Render one block to wrapped, styled terminal lines.
 */
export function renderBlock(block: IBlock, width: number): string[] {
  switch (block.type) {
    case 'heading': {
      const prefix = style.bold + theme.heading;
      const text = prefix + renderInline(block.lines[0], prefix) + style.reset;
      return wrapAnsi(text, width);
    }
    case 'hr':
      return [style.dim + '─'.repeat(Math.max(1, width)) + style.reset];
    case 'code':
      return renderCode(block, width);
    case 'quote':
      return block.lines.flatMap(line =>
        wrapAnsi(renderInline(line), Math.max(1, width - 2)).map(
          row => theme.quote + '│ ' + style.reset + row
        )
      );
    case 'list':
      return renderList(block.lines, width);
    case 'table':
      return renderTable(block.lines, width);
    default:
      return wrapAnsi(
        renderInline(block.lines.map(line => line.trim()).join(' ')),
        width
      );
  }
}

/**
 * Render blocks separated by blank lines.
 */
export function renderBlocks(blocks: IBlock[], width: number): string[] {
  const lines: string[] = [];
  blocks.forEach((block, index) => {
    if (index > 0) {
      lines.push('');
    }
    lines.push(...renderBlock(block, width));
  });
  return lines;
}

export function renderMarkdown(markdown: string, width: number): string[] {
  return renderBlocks(parseBlocks(markdown), width);
}
