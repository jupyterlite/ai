import { Notification } from '@jupyterlab/apputils';
import type { Contents } from '@jupyterlab/services';
import { nullTranslator, type ITranslator } from '@jupyterlab/translation';
import fs from 'fs';
import type { Volume } from 'memfs';
import path from 'path';

import type { DriveOperations } from './drive';

/**
 * The pi agent folder (settings, credentials, sessions) in the in-memory file
 * system. Each of its files is saved in the IndexedDB of the page.
 */
export const AGENT_DIR = process.env.PI_CODING_AGENT_DIR!;

/**
 * Where the JupyterLab contents appear for pi, as in the cockle shell.
 */
export const DRIVE = '/drive';

/**
 * The contents path of an absolute pi path, or null outside the drive.
 */
export function toContentsPath(absolutePath: string): string | null {
  const normalized = path.posix.normalize(absolutePath).replace(/\/$/, '');
  if (normalized === DRIVE) {
    return '';
  }
  return normalized.startsWith(`${DRIVE}/`)
    ? normalized.slice(DRIVE.length + 1)
    : null;
}

export function drivePath(contentsPath: string): string {
  return contentsPath ? `${DRIVE}/${contentsPath}` : DRIVE;
}

const DATABASE = 'jupyternaut-pi';
/**
 * One record for each file of the agent folder, keyed by its path.
 */
const FILES = 'files';
const SAVE_DELAY_MS = 500;

/**
 * Outside macOS, the browser keeps keys such as Ctrl+T, Ctrl+N and Ctrl+W,
 * JupyterLab pastes text on Ctrl+V, and xterm.js 5 sends Alt+Up as Ctrl+Up:
 * these actions take the keys of pi on Windows, or other free keys.
 */
const BROWSER_KEYBINDINGS = {
  'app.thinking.toggle': ['alt+t'],
  'app.tree.filter.noTools': ['alt+t'],
  'app.session.toggleNamedFilter': ['alt+n'],
  'app.message.dequeue': ['alt+q'],
  'app.model.cycleBackward': ['alt+p'],
  'app.clipboard.pasteImage': ['alt+v'],
  'app.models.reorderUp': ['shift+alt+up'],
  'app.models.reorderDown': ['shift+alt+down'],
  'tui.editor.deleteWordBackward': ['alt+backspace']
};

const KEYBINDINGS = {
  'app.suspend': [],
  'app.editor.external': [],
  ...(/Mac/i.test(navigator.platform) ? {} : BROWSER_KEYBINDINGS)
};

const CONTEXT_FILES = new Set([
  'AGENTS.override.md',
  'AGENTS.md',
  'AGENTS.MD',
  'CLAUDE.md',
  'CLAUDE.MD'
]);
const RESOURCE_DIRECTORIES = new Set(['.pi', '.agents']);
const SKIPPED_RESOURCES = new Set(['extensions', 'sessions', 'node_modules']);
const MAX_MIRRORED_FILES = 500;
const MAX_MIRRORED_SIZE = 512 * 1024;

export const volume = (fs as unknown as { vol: Volume }).vol;

/**
 * A saved file: pi orders the sessions by modification time.
 */
interface IStoredFile {
  data: string;
  mtime: number;
}

/**
 * Saved files by path, null for a removed file.
 */
type FileChanges = Record<string, IStoredFile | null>;

let database: IDBDatabase | undefined;
let opening: Promise<IDBDatabase> | undefined;
let channel: BroadcastChannel | undefined;
let restoring: Promise<void> | undefined;
let reloading = Promise.resolve();
/**
 * A tab that cannot load the agent folder does not save it: its files would
 * replace the saved ones.
 */
let loaded = false;
let trans = nullTranslator.load('jupyterlite_ai');
let saveTimer: number | undefined;
const dirty = new Set<string>();
let uploadTimer: number | undefined;
const uploads = new Set<string>();

function isAgentPath(file: string): boolean {
  return file === AGENT_DIR || file.startsWith(`${AGENT_DIR}/`);
}

/**
 * The database connection, kept open so that a save can start while the page
 * closes.
 */
function openDatabase(): Promise<IDBDatabase> {
  if (database) {
    return Promise.resolve(database);
  }
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE);
    request.onupgradeneeded = () => request.result.createObjectStore(FILES);
    request.onsuccess = () => {
      const db = request.result;
      const forget = () => {
        if (database === db) {
          database = undefined;
        }
      };
      // Another tab upgrades or deletes the database: the next save reopens it.
      db.onversionchange = () => {
        db.close();
        forget();
      };
      db.onclose = forget;
      database = db;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).finally(() => {
    opening = undefined;
  });
  return opening;
}

/**
 * Run requests on the files; resolves with their result once the transaction
 * is committed.
 */
function transact<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => T
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILES, mode);
    const result = run(transaction.objectStore(FILES));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = event =>
      reject((event.target as IDBRequest).error ?? transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function readFiles(): Promise<FileChanges> {
  const { keys, values } = await transact(
    await openDatabase(),
    'readonly',
    store => ({ keys: store.getAllKeys(), values: store.getAll() })
  );
  return Object.fromEntries(
    keys.result.map((key, index) => [String(key), values.result[index]])
  );
}

/**
 * Write a file into the in-memory file system, without saving it again. The
 * first builds saved the text of a file only.
 */
function applyFile(file: string, stored: IStoredFile | string | null): void {
  try {
    if (stored === null) {
      volume.rmSync(file, { force: true, recursive: true });
      return;
    }
    const data = typeof stored === 'string' ? stored : stored.data;
    if (typeof data !== 'string') {
      console.warn(`pi: cannot restore ${file}: unknown record`, stored);
      return;
    }
    volume.mkdirSync(path.posix.dirname(file), { recursive: true });
    volume.writeFileSync(file, data);
    if (typeof stored !== 'string' && Number.isFinite(stored.mtime)) {
      const time = new Date(stored.mtime);
      volume.utimesSync(file, time, time);
    }
  } catch (error) {
    console.warn(`pi: cannot restore ${file}`, error);
  }
}

const listeners = new Set<(files: string[]) => void>();

/**
 * Call a function with the agent files that change, in this tab or another.
 */
export function onAgentFilesChange(listener: (files: string[]) => void): void {
  listeners.add(listener);
}

/**
 * Load the files that another tab saved. The database has the last version
 * of each file, the messages of the tabs can arrive in another order.
 */
function reloadFiles(files: unknown): void {
  if (!Array.isArray(files)) {
    return;
  }
  const paths = files.filter(
    (file): file is string => typeof file === 'string' && isAgentPath(file)
  );
  reloading = reloading
    .then(async () => {
      const requests = await transact(await openDatabase(), 'readonly', store =>
        paths.map(file => [file, store.get(file)] as const)
      );
      for (const [file, request] of requests) {
        dirty.delete(file);
        applyFile(file, request.result ?? null);
      }
      for (const listener of listeners) {
        listener(paths);
      }
    })
    .catch(error => console.warn('pi: cannot load the changed files', error));
}

/**
 * A changed path: null when it is gone, undefined for a directory.
 */
function readChange(file: string): IStoredFile | null | undefined {
  try {
    const stats = volume.statSync(file);
    if (!stats.isFile()) {
      return undefined;
    }
    return {
      data: volume.readFileSync(file, 'utf8') as string,
      mtime: Number(stats.mtimeMs)
    };
  } catch {
    return null;
  }
}

/**
 * Add the changes of a path; a changed directory (a renamed folder) changes
 * the files below it.
 */
function readChanges(file: string, changes: FileChanges): void {
  const content = readChange(file);
  if (content !== undefined) {
    changes[file] = content;
    return;
  }
  for (const name of volume.readdirSync(file) as string[]) {
    readChanges(path.posix.join(file, name), changes);
  }
}

/**
 * Save the changed files. The transaction starts at once when the database
 * is open, also while the page closes.
 */
function save(): void {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  const changes: FileChanges = {};
  for (const file of dirty) {
    readChanges(file, changes);
  }
  dirty.clear();
  const files = Object.keys(changes);
  if (!files.length) {
    return;
  }
  // A tab does not get its own messages on the channel.
  for (const listener of listeners) {
    listener(files);
  }
  if (!loaded) {
    return;
  }
  const write = (db: IDBDatabase) =>
    transact(db, 'readwrite', store => {
      for (const file of files) {
        // Drop the files below a path that was a directory.
        store.delete(IDBKeyRange.bound(`${file}/`, `${file}0`, false, true));
        const content = changes[file];
        if (content === null) {
          store.delete(file);
        } else {
          store.put(content, file);
        }
      }
    });
  (database ? write(database) : openDatabase().then(write)).then(
    () => channel?.postMessage(files),
    error => {
      console.error('pi: cannot save the agent folder', error);
      // The next save tries again.
      for (const file of files) {
        dirty.add(file);
      }
    }
  );
}

/**
 * Save the drive files that pi wrote outside its tools (an HTML export, the
 * project settings) with the contents API.
 */
function upload(): void {
  uploadTimer = undefined;
  const { drive } = fs as unknown as {
    drive?: Pick<DriveOperations, 'mkdir' | 'writeFile'>;
  };
  for (const file of uploads) {
    const content = readChange(file);
    if (content && drive) {
      // pi already reported the write: show a failure.
      drive
        .mkdir(path.posix.dirname(file))
        .then(() => drive.writeFile(file, content.data))
        .catch(error => {
          console.warn(`pi: cannot save ${file}`, error);
          Notification.error(
            trans.__(
              'Cannot save %1 to the drive: %2',
              toContentsPath(file),
              error instanceof Error ? error.message : String(error)
            )
          );
        });
    }
  }
  uploads.clear();
}

function onChange(changed: string): void {
  if (isAgentPath(changed)) {
    dirty.add(changed);
    saveTimer ??= window.setTimeout(save, SAVE_DELAY_MS);
  } else if (toContentsPath(changed) !== null) {
    uploads.add(changed);
    uploadTimer ??= window.setTimeout(upload, SAVE_DELAY_MS);
  }
}

async function restore(): Promise<void> {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(DATABASE);
    channel.onmessage = event => reloadFiles(event.data);
  }
  // The files that other tabs save while the folder loads are loaded after it.
  reloading = readFiles()
    .catch(() => readFiles())
    .then(
      files => {
        for (const [file, content] of Object.entries(files)) {
          applyFile(file, content);
        }
        loaded = true;
      },
      error => {
        console.warn('pi: cannot load the agent folder', error);
        Notification.warning(
          trans.__(
            'Cannot load the pi settings and sessions: the changes in this tab are not saved.'
          )
        );
      }
    );
  await reloading;
  (fs as unknown as { onChange: (changed: string) => void }).onChange =
    onChange;
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      save();
    }
  });
  fs.mkdirSync(AGENT_DIR, { recursive: true });
  const keybindings = path.join(AGENT_DIR, 'keybindings.json');
  if (!fs.existsSync(keybindings)) {
    fs.writeFileSync(keybindings, JSON.stringify(KEYBINDINGS, null, 2));
  }
}

/**
 * Load the saved agent folder into the in-memory file system, then save each
 * changed file and take the files that other tabs save.
 */
export function restoreAgentDir(translator?: ITranslator): Promise<void> {
  trans = (translator ?? nullTranslator).load('jupyterlite_ai');
  return (restoring ??= restore());
}

/**
 * Copies the project resources of the drive (context files, `.pi` and
 * `.agents` folders, skills) into the in-memory file system, where pi
 * discovers them. Tools still read and write the drive itself, and the other
 * writes of pi below the drive are saved to it.
 */
export class DriveMirror {
  constructor(contents: Contents.IManager) {
    this._contents = contents;
  }

  /**
   * Copy the resources of a working directory and extra drive folders, and
   * remove the copies of the files that are gone from them.
   */
  sync(cwd: string, folders: string[] = []): Promise<void> {
    const directory = normalizeDirectory(cwd);
    return this._run(async () => {
      fs.mkdirSync(directory, { recursive: true });
      const files = await this._collect(directory, folders);
      // The copies go through the volume: they are not saved to the drive.
      for (const [target, content] of files) {
        try {
          volume.mkdirSync(path.posix.dirname(target), { recursive: true });
          volume.writeFileSync(target, content);
        } catch (error) {
          console.warn(`pi: cannot mirror ${target}`, error);
          files.delete(target);
        }
      }
      const directories = ancestors(directory);
      const roots = [
        ...directories.flatMap(parent =>
          [...RESOURCE_DIRECTORIES].map(name => `${parent}/${name}/`)
        ),
        ...folders.map(folder => `${DRIVE}/${folder}/`)
      ];
      for (const file of this._mirrored) {
        const scanned =
          directories.includes(path.posix.dirname(file)) ||
          roots.some(root => file.startsWith(root));
        if (scanned && !files.has(file)) {
          volume.rmSync(file, { force: true });
          this._mirrored.delete(file);
        }
      }
      for (const file of files.keys()) {
        this._mirrored.add(file);
      }
    });
  }

  /**
   * Run the tasks one after the other; a failed task does not stop the next.
   */
  private _run(task: () => Promise<void>): Promise<void> {
    const result = this._queue.then(task);
    this._queue = result.catch(() => undefined);
    return result;
  }

  private async _collect(
    cwd: string,
    folders: string[]
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    for (const directory of ancestors(cwd)) {
      for (const entry of await this._list(directory.slice(DRIVE.length + 1))) {
        if (entry.type === 'directory') {
          if (RESOURCE_DIRECTORIES.has(entry.name)) {
            await this._copyTree(entry.path, 0, files);
          }
        } else if (CONTEXT_FILES.has(entry.name)) {
          await this._copyFile(entry.path, files);
        }
      }
    }
    for (const folder of folders) {
      await this._copyTree(folder, 0, files);
    }
    return files;
  }

  private async _list(contentsPath: string): Promise<Contents.IModel[]> {
    try {
      const model = await this._contents.get(contentsPath, { content: true });
      return model.type === 'directory'
        ? ((model.content ?? []) as Contents.IModel[])
        : [];
    } catch {
      return [];
    }
  }

  private async _copyTree(
    contentsPath: string,
    depth: number,
    files: Map<string, string>
  ): Promise<void> {
    if (depth > 6 || files.size >= MAX_MIRRORED_FILES) {
      return;
    }
    for (const entry of await this._list(contentsPath)) {
      if (entry.type === 'directory') {
        if (!SKIPPED_RESOURCES.has(entry.name)) {
          await this._copyTree(entry.path, depth + 1, files);
        }
      } else if ((entry.size ?? 0) <= MAX_MIRRORED_SIZE) {
        await this._copyFile(entry.path, files);
      }
    }
  }

  private async _copyFile(
    contentsPath: string,
    files: Map<string, string>
  ): Promise<void> {
    if (files.size >= MAX_MIRRORED_FILES) {
      return;
    }
    try {
      const model = await this._contents.get(contentsPath, {
        content: true,
        type: 'file',
        format: 'text'
      });
      files.set(`${DRIVE}/${contentsPath}`, model.content as string);
    } catch {
      // pi does without a file that cannot be read.
    }
  }

  private _contents: Contents.IManager;
  private _mirrored = new Set<string>();
  private _queue = Promise.resolve();
}

function normalizeDirectory(directory: string): string {
  return path.posix.normalize(directory).replace(/(.)\/$/, '$1');
}

/**
 * A drive directory and its parents up to the drive root.
 */
function ancestors(cwd: string): string[] {
  const result: string[] = [];
  let current = cwd;
  while (toContentsPath(current) !== null) {
    result.push(current);
    current = path.posix.dirname(current);
  }
  return result;
}
