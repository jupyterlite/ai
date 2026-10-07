import type { Contents } from '@jupyterlab/services';
import fs from 'fs';
import type { Volume } from 'memfs';
import path from 'path';

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

const KEYBINDINGS = {
  'app.suspend': [],
  'app.editor.external': []
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

const volume = (fs as unknown as { vol: Volume }).vol;

/**
 * File contents by path, null for a removed file.
 */
type FileChanges = Record<string, string | null>;

let database: IDBDatabase | undefined;
let opening: Promise<IDBDatabase> | undefined;
let channel: BroadcastChannel | undefined;
let restoring: Promise<void> | undefined;
let reloading = Promise.resolve();
let saveTimer: number | undefined;
const dirty = new Set<string>();

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
 * Write a file into the in-memory file system, without saving it again.
 */
function applyFile(file: string, content: string | null): void {
  try {
    if (content === null) {
      volume.rmSync(file, { force: true, recursive: true });
    } else {
      volume.mkdirSync(path.posix.dirname(file), { recursive: true });
      volume.writeFileSync(file, content);
    }
  } catch (error) {
    console.warn(`pi: cannot restore ${file}`, error);
  }
}

const remoteListeners = new Set<(files: string[]) => void>();

/**
 * Call a function with the agent files that another tab saved.
 */
export function onRemoteChange(listener: (files: string[]) => void): void {
  remoteListeners.add(listener);
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
        applyFile(
          file,
          typeof request.result === 'string' ? request.result : null
        );
      }
      for (const listener of remoteListeners) {
        listener(paths);
      }
    })
    .catch(error => console.warn('pi: cannot load the changed files', error));
}

/**
 * The content of a changed path: null when it is gone, undefined for a
 * directory.
 */
function readChange(file: string): string | null | undefined {
  try {
    if (!volume.statSync(file).isFile()) {
      return undefined;
    }
    return volume.readFileSync(file, 'utf8') as string;
  } catch {
    return null;
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
    const content = readChange(file);
    if (content !== undefined) {
      changes[file] = content;
    }
  }
  dirty.clear();
  const files = Object.keys(changes);
  if (!files.length) {
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

function onChange(changed: string): void {
  if (isAgentPath(changed)) {
    dirty.add(changed);
    saveTimer ??= window.setTimeout(save, SAVE_DELAY_MS);
  }
}

async function restore(): Promise<void> {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(DATABASE);
    channel.onmessage = event => reloadFiles(event.data);
  }
  // The files that other tabs save while the folder loads are loaded after it.
  reloading = readFiles()
    .then(files => {
      for (const [file, content] of Object.entries(files)) {
        applyFile(file, content);
      }
    })
    .catch(error => console.warn('pi: cannot load the agent folder', error));
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
export function restoreAgentDir(): Promise<void> {
  return (restoring ??= restore());
}

/**
 * Copies the project resources of the drive (context files, `.pi` and
 * `.agents` folders, skills) into the in-memory file system, where pi
 * discovers them. Tools still read and write the drive itself.
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
      for (const [target, content] of files) {
        try {
          fs.mkdirSync(path.posix.dirname(target), { recursive: true });
          fs.writeFileSync(target, content);
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
          fs.rmSync(file, { force: true });
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
  while (current === DRIVE || current.startsWith(`${DRIVE}/`)) {
    result.push(current);
    if (current === DRIVE) {
      break;
    }
    current = path.posix.dirname(current);
  }
  return result;
}
