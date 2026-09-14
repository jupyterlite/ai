/**
 * A decoded key press or paste event coming from the terminal.
 */
export interface IKey {
  /**
   * A printable character, or a symbolic name such as `enter`, `up` or `paste`.
   */
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  /**
   * Text payload for printable keys and pastes.
   */
  text?: string;
}

const CSI_FINAL: Record<string, string> = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
  H: 'home',
  F: 'end'
};

const CSI_TILDE: Record<string, string> = {
  '1': 'home',
  '2': 'insert',
  '3': 'delete',
  '4': 'end',
  '5': 'pageup',
  '6': 'pagedown',
  '7': 'home',
  '8': 'end'
};

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

function key(name: string, text?: string): IKey {
  return { name, ctrl: false, meta: false, shift: false, text };
}

function withModifier(name: string, modifier: number): IKey {
  const bits = modifier - 1;
  return {
    name,
    shift: (bits & 1) > 0,
    meta: (bits & 2) > 0,
    ctrl: (bits & 4) > 0
  };
}

/**
 * Decode raw terminal input (keystrokes, escape sequences, bracketed pastes) into keys.
 */
export function parseKeys(input: string): IKey[] {
  const keys: IKey[] = [];
  const n = input.length;
  let i = 0;
  while (i < n) {
    const ch = input[i];
    const code = input.charCodeAt(i);

    if (ch === '\x1b') {
      if (input.startsWith(PASTE_START, i)) {
        const start = i + PASTE_START.length;
        const end = input.indexOf(PASTE_END, start);
        const text = end === -1 ? input.slice(start) : input.slice(start, end);
        keys.push(key('paste', text.replace(/\r\n?/g, '\n')));
        i = end === -1 ? n : end + PASTE_END.length;
        continue;
      }
      if (input[i + 1] === '[') {
        let j = i + 2;
        while (
          j < n &&
          (input.charCodeAt(j) < 0x40 || input.charCodeAt(j) > 0x7e)
        ) {
          j++;
        }
        if (j >= n) {
          // Incomplete sequence, drop it.
          break;
        }
        const params = input.slice(i + 2, j);
        const final = input[j];
        if (params.startsWith('<')) {
          // SGR mouse report: only wheel events are of interest.
          const button = parseInt(params.slice(1), 10);
          if (final === 'M' && (button & 64) > 0) {
            keys.push(key((button & 1) > 0 ? 'wheeldown' : 'wheelup'));
          }
          i = j + 1;
          continue;
        }
        const parts = params.split(';');
        const modifier = parts.length > 1 ? parseInt(parts[1], 10) || 1 : 1;
        if (final === 'Z') {
          keys.push({ name: 'tab', ctrl: false, meta: false, shift: true });
        } else {
          const name = final === '~' ? CSI_TILDE[parts[0]] : CSI_FINAL[final];
          if (name) {
            keys.push(withModifier(name, modifier));
          }
        }
        i = j + 1;
        continue;
      }
      if (input[i + 1] === 'O' && i + 2 < n && CSI_FINAL[input[i + 2]]) {
        keys.push(key(CSI_FINAL[input[i + 2]]));
        i += 3;
        continue;
      }
      if (i + 1 < n) {
        // ESC followed by a key is the meta (alt) modifier.
        const next = input[i + 1];
        if (next === '\r' || next === '\n') {
          keys.push({ name: 'enter', ctrl: false, meta: true, shift: false });
        } else if (next === '\x7f' || next === '\b') {
          keys.push({
            name: 'backspace',
            ctrl: false,
            meta: true,
            shift: false
          });
        } else {
          keys.push({
            name: next,
            ctrl: false,
            meta: true,
            shift: false,
            text: next
          });
        }
        i += 2;
        continue;
      }
      keys.push(key('escape'));
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      keys.push(key('enter'));
      i++;
      continue;
    }
    if (ch === '\t') {
      keys.push(key('tab'));
      i++;
      continue;
    }
    if (ch === '\x7f' || ch === '\b') {
      keys.push(key('backspace'));
      i++;
      continue;
    }
    if (code < 32) {
      keys.push({
        name: String.fromCharCode(code + 96),
        ctrl: true,
        meta: false,
        shift: false
      });
      i++;
      continue;
    }

    const text = String.fromCodePoint(input.codePointAt(i)!);
    keys.push(key(text, text));
    i += text.length;
  }
  return keys;
}
