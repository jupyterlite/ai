import type {
  ExtensionUIContext,
  ExtensionUIDialogOptions,
  ProjectTrustContext
} from '@earendil-works/pi-coding-agent';
import { Dialog, Notification } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';

/**
 * A JupyterLab dialog for a question of pi: the signal and the timeout of
 * the question close it. Resolves with nothing when the user cancels.
 */
async function question<T>(
  options: Partial<Dialog.IOptions<T>>,
  opts?: ExtensionUIDialogOptions
): Promise<Dialog.IResult<T> | undefined> {
  if (opts?.signal?.aborted) {
    return undefined;
  }
  const dialog = new Dialog<T>(options);
  const close = () => dialog.reject();
  const timer = opts?.timeout ? window.setTimeout(close, opts.timeout) : 0;
  opts?.signal?.addEventListener('abort', close, { once: true });
  const result = await dialog.launch().finally(() => {
    window.clearTimeout(timer);
    opts?.signal?.removeEventListener('abort', close);
  });
  return result.button.accept ? result : undefined;
}

/**
 * Ask for the value of one control, after the lines of the question that
 * follow its title.
 */
async function ask(
  control: HTMLInputElement | HTMLSelectElement,
  title: string,
  opts?: ExtensionUIDialogOptions
): Promise<string | undefined> {
  const [heading, ...lines] = title.split('\n');
  const body = Object.assign(new Widget(), { getValue: () => control.value });
  body.addClass('jp-pi-Question');
  const text = lines.join('\n').trim();
  if (text) {
    const label = document.createElement('label');
    label.textContent = text;
    body.node.append(label);
  }
  body.node.append(control);
  const result = await question(
    { title: heading, body, focusNodeSelector: control.localName },
    opts
  );
  return result?.value ?? undefined;
}

/**
 * The questions of pi (`ctx.ui` of the extensions, the project trust) in
 * JupyterLab dialogs.
 */
export const DIALOG_UI: Pick<
  ExtensionUIContext,
  'select' | 'confirm' | 'input'
> = {
  select: (title, options, opts) => {
    const control = document.createElement('select');
    control.append(...options.map(option => new Option(option)));
    return ask(control, title, opts);
  },
  confirm: async (title, message, opts) =>
    !!(await question({ title, body: message }, opts)),
  input: (title, placeholder, opts) => {
    const control = document.createElement('input');
    control.placeholder = placeholder ?? '';
    return ask(control, title, opts);
  }
};

/**
 * The project trust question in a JupyterLab dialog: in the chat, and in
 * the terminal once pi's own interface runs.
 */
export function dialogTrustContext(cwd: string): ProjectTrustContext {
  return {
    cwd,
    mode: 'tui',
    hasUI: true,
    ui: {
      ...DIALOG_UI,
      notify: (message, type) => Notification.emit(message, type ?? 'info')
    }
  };
}
