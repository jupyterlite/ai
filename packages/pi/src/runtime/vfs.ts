import { Notification } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import type { Contents } from '@jupyterlab/services';
import { nullTranslator, type ITranslator } from '@jupyterlab/translation';
import fs from 'fs';
import type { Volume } from 'memfs';
import path from 'path';

import type { DriveOperations } from './drive';

/**
 * The pi agent folder (settings, sessions, skills, extensions) in the
 * in-memory file system, where pi reads it. It is saved to `.pi/agent` in the
 * drive, except the credentials.
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

/**
 * Files of the agent folder that stay in the IndexedDB of the page: the API
 * keys do not go to the drive, which the tools, the kernels and a Jupyter
 * server read.
 */
const PRIVATE_FILES = new Set(['auth.json']);

export function isAgentPath(file: string): boolean {
  return file === AGENT_DIR || file.startsWith(`${AGENT_DIR}/`);
}

export function isPrivateFile(file: string): boolean {
  const normalized = path.posix.normalize(file);
  return (
    path.posix.dirname(normalized) === AGENT_DIR &&
    PRIVATE_FILES.has(path.posix.basename(normalized))
  );
}

const DATABASE = 'jupyternaut-pi';
/**
 * One record for each private file, keyed by its name.
 */
const FILES = 'files';
const SAVE_DELAY_MS = 500;
/**
 * The drive files that load at the same time: browsers open 6 connections to
 * a server.
 */
const LOADERS = 6;

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

const KEYBINDINGS_FILE = path.posix.join(AGENT_DIR, 'keybindings.json');

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
 * A file of the agent folder: pi orders the sessions by modification time.
 */
interface IStoredFile {
  data: string;
  mtime: number;
}

/**
 * Files by path, null for a removed file.
 */
type FileChanges = Record<string, IStoredFile | null>;

let drive: DriveOperations;
let database: IDBDatabase | undefined;
let opening: Promise<IDBDatabase> | undefined;
let channel: BroadcastChannel | undefined;
let restoring: Promise<void> | undefined;
let reloading = Promise.resolve();
/**
 * A tab that cannot load the credentials or the files of the drive does not
 * save them: its files would replace the saved ones.
 */
let privateLoaded = false;
let driveLoaded = false;
let trans = nullTranslator.load('jupyterlite_ai');
let saveTimer: number | undefined;
const dirty = new Set<string>();
let uploadTimer: number | undefined;
const uploads = new Set<string>();
let writes = Promise.resolve();
let pendingWrites = 0;
/**
 * The contents paths that this tab writes: their changes are not changes
 * from outside.
 */
const writing = new Set<string>();
/**
 * The agent files that are in the drive, to delete the removed ones.
 */
const savedFiles = new Set<string>();
let saveFailed = false;

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
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

async function readPrivateFiles(files: string[]): Promise<FileChanges> {
  const requests = await transact(await openDatabase(), 'readonly', store =>
    files.map(file => store.get(path.posix.basename(file)))
  );
  return Object.fromEntries(
    files.map((file, index) => [file, requests[index].result ?? null])
  );
}

/**
 * Write a file into the in-memory file system, without saving it again.
 */
function applyFile(file: string, stored: IStoredFile | null): void {
  try {
    if (stored === null) {
      volume.rmSync(file, { force: true, recursive: true });
      return;
    }
    volume.mkdirSync(path.posix.dirname(file), { recursive: true });
    volume.writeFileSync(file, stored.data);
    if (Number.isFinite(stored.mtime)) {
      const time = new Date(stored.mtime);
      volume.utimesSync(file, time, time);
    }
  } catch (error) {
    console.warn(`pi: cannot restore ${file}`, error);
  }
}

/**
 * pi reads the keys of the browser from keybindings.json: they stay in memory
 * until the drive has this file.
 */
function applyDefaults(): void {
  if (!volume.existsSync(KEYBINDINGS_FILE)) {
    volume.mkdirSync(AGENT_DIR, { recursive: true });
    volume.writeFileSync(
      KEYBINDINGS_FILE,
      JSON.stringify(KEYBINDINGS, null, 2)
    );
  }
}

/**
 * The files below a folder of the drive, with their modification times.
 */
async function listDriveFiles(folder: string): Promise<Map<string, number>> {
  const files = new Map<string, number>();
  const queue = [folder];
  while (queue.length) {
    const current = queue.shift()!;
    let entries: Contents.IModel[];
    try {
      entries = await drive.list(toContentsPath(current)!);
    } catch (error) {
      if (isMissing(error)) {
        continue;
      }
      throw error;
    }
    for (const entry of entries) {
      const file = drivePath(entry.path);
      if (entry.type === 'directory') {
        queue.push(file);
      } else if (!isPrivateFile(file)) {
        files.set(file, Date.parse(entry.last_modified));
      }
    }
  }
  return files;
}

/**
 * Copy files of the drive into the in-memory file system.
 */
async function loadDriveFiles(files: Map<string, number>): Promise<void> {
  const queue = [...files];
  const load = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [file, mtime] = item;
      try {
        const data = await drive.readFile(file);
        applyFile(file, { data: data.toString('utf-8'), mtime });
        savedFiles.add(file);
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
        applyFile(file, null);
        savedFiles.delete(file);
      }
    }
  };
  await Promise.all(Array.from({ length: LOADERS }, load));
}

/**
 * The files of the in-memory file system at or below a path.
 */
function localFiles(file: string): string[] {
  try {
    if (!volume.statSync(file).isDirectory()) {
      return [file];
    }
  } catch {
    return [];
  }
  return (volume.readdirSync(file) as string[]).flatMap(name =>
    localFiles(path.posix.join(file, name))
  );
}

/**
 * Load a file or a folder of the drive again; the saved files that are gone
 * from it are removed. Resolves with the changed files.
 */
async function reloadFromDrive(file: string): Promise<string[]> {
  let files = new Map<string, number>();
  try {
    files = (await drive.stat(file)).isDirectory()
      ? await listDriveFiles(file)
      : new Map([[file, Date.now()]]);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
  const removed = localFiles(file).filter(
    local => savedFiles.has(local) && !files.has(local)
  );
  for (const local of removed) {
    volume.rmSync(local, { force: true });
    savedFiles.delete(local);
  }
  await loadDriveFiles(files);
  return [...removed, ...files.keys()];
}

const listeners = new Set<(files: string[]) => void>();

/**
 * Call a function with the agent files that change, in this tab or outside.
 */
export function onAgentFilesChange(listener: (files: string[]) => void): void {
  listeners.add(listener);
}

function notify(files: string[]): void {
  for (const listener of listeners) {
    listener(files);
  }
}

/**
 * Load the agent files that changed outside the pi of this tab: in another
 * tab, in a JupyterLab editor or with a tool. These changes replace the
 * changes that this tab did not save yet.
 */
function reloadFiles(files: unknown): void {
  if (!Array.isArray(files)) {
    return;
  }
  const paths = files.filter(
    (file): file is string => typeof file === 'string' && isAgentPath(file)
  );
  if (!paths.length) {
    return;
  }
  reloading = reloading
    .then(async () => {
      const changed: string[] = [];
      for (const file of paths) {
        dirty.delete(file);
        if (isPrivateFile(file)) {
          const stored = await readPrivateFiles([file]);
          applyFile(file, stored[file]);
          changed.push(file);
        } else {
          changed.push(...(await reloadFromDrive(file)));
        }
      }
      applyDefaults();
      notify(changed);
    })
    .catch(error => console.warn('pi: cannot load the changed files', error));
}

/**
 * Load the agent files that a JupyterLab editor or a tool changes, also in
 * the other tabs. A new folder changes no file.
 */
function onDriveChange(
  sender: Contents.IManager,
  change: Contents.IChangedArgs
): void {
  if (change.type !== 'rename' && change.newValue?.type === 'directory') {
    return;
  }
  const files = [change.oldValue?.path, change.newValue?.path]
    .filter(
      (contentsPath): contentsPath is string =>
        typeof contentsPath === 'string' && !writing.has(contentsPath)
    )
    .map(drivePath)
    // A deleted or renamed `.pi` folder changes the whole agent folder.
    .map(file => (AGENT_DIR.startsWith(`${file}/`) ? AGENT_DIR : file))
    .filter(file => isAgentPath(file) && !isPrivateFile(file));
  if (files.length) {
    reloadFiles(files);
    channel?.postMessage(files);
  }
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
 * Save the credentials. The transaction starts at once when the database is
 * open, also while the page closes.
 */
function savePrivateFiles(files: string[], changes: FileChanges): void {
  const write = (db: IDBDatabase) =>
    transact(db, 'readwrite', store => {
      for (const file of files) {
        const content = changes[file];
        const key = path.posix.basename(file);
        if (content === null) {
          store.delete(key);
        } else {
          store.put(content, key);
        }
      }
    });
  (database ? write(database) : openDatabase().then(write)).then(
    () => channel?.postMessage(files),
    error => {
      console.error('pi: cannot save the credentials', error);
      // The next save tries again.
      for (const file of files) {
        dirty.add(file);
      }
    }
  );
}

async function writeDriveFile(file: string, data: string): Promise<void> {
  try {
    await drive.writeFile(file, data);
  } catch {
    // The first file of a folder creates the folder.
    await drive.mkdir(path.posix.dirname(file));
    await drive.writeFile(file, data);
  }
}

/**
 * Delete a removed file or folder from the drive, when it was saved.
 */
async function removeDriveFiles(file: string): Promise<void> {
  const saved = [...savedFiles].filter(
    savedFile => savedFile === file || savedFile.startsWith(`${file}/`)
  );
  if (!saved.length) {
    return;
  }
  try {
    await drive.remove(file);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
  for (const savedFile of saved) {
    savedFiles.delete(savedFile);
  }
}

/**
 * Save files of the agent folder to the drive, as they are when their turn
 * comes: a change from outside can load a newer file meanwhile. A failed file
 * is saved with its next change, as pi writes whole files.
 */
async function writeDrive(files: string[]): Promise<void> {
  for (const file of files) {
    const contentsPath = toContentsPath(file)!;
    const content = readChange(file);
    if (content === undefined) {
      continue;
    }
    writing.add(contentsPath);
    try {
      if (content) {
        await writeDriveFile(file, content.data);
        savedFiles.add(file);
      } else {
        await removeDriveFiles(file);
      }
      saveFailed = false;
    } catch (error) {
      console.warn(`pi: cannot save ${file}`, error);
      if (!saveFailed) {
        saveFailed = true;
        Notification.error(
          trans.__(
            'Cannot save the pi files to %1: %2',
            toContentsPath(AGENT_DIR),
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    } finally {
      writing.delete(contentsPath);
    }
  }
}

/**
 * Save the changed files of the agent folder.
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
  notify(files);
  const privateFiles = files.filter(isPrivateFile);
  const driveFiles = files.filter(file => !isPrivateFile(file));
  if (privateFiles.length && privateLoaded) {
    savePrivateFiles(privateFiles, changes);
  }
  if (driveFiles.length && driveLoaded) {
    pendingWrites++;
    writes = writes
      .then(() => writeDrive(driveFiles))
      .then(() => channel?.postMessage(driveFiles))
      .finally(() => pendingWrites--);
  }
}

/**
 * Ask before the page closes while files of the agent folder are not saved:
 * the contents requests stop with the page.
 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  save();
  if (pendingWrites) {
    event.preventDefault();
  }
}

/**
 * Save the drive files that pi wrote outside its tools (an HTML export, the
 * project settings) with the contents API.
 */
function upload(): void {
  uploadTimer = undefined;
  for (const file of uploads) {
    const content = readChange(file);
    if (content) {
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

async function restore(options: IRestoreOptions): Promise<void> {
  drive = options.drive;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(DATABASE);
    channel.onmessage = event => reloadFiles(event.data);
  }
  const privateFiles = [...PRIVATE_FILES].map(name =>
    path.posix.join(AGENT_DIR, name)
  );
  const loadPrivate = readPrivateFiles(privateFiles)
    .catch(() => readPrivateFiles(privateFiles))
    .then(
      stored => {
        for (const [file, content] of Object.entries(stored)) {
          applyFile(file, content);
        }
        privateLoaded = true;
      },
      error => {
        console.warn('pi: cannot load the credentials', error);
        Notification.warning(
          trans.__(
            'Cannot load the pi keys: the keys added in this tab are not saved.'
          )
        );
      }
    );
  // A Jupyter server that refuses the hidden files saves them, then hides
  // them on the next load: pi would replace its saved settings.
  const hiddenAllowed = PageConfig.getOption('allow_hidden_files') !== 'false';
  const loadDrive = (
    hiddenAllowed
      ? listDriveFiles(AGENT_DIR)
      : Promise.reject(
          new Error(
            trans.__(
              'the server does not allow hidden files (c.ContentsManager.allow_hidden)'
            )
          )
        )
  )
    .then(loadDriveFiles)
    .then(
      () => {
        driveLoaded = true;
      },
      error => {
        console.warn('pi: cannot load the agent folder', error);
        Notification.warning(
          trans.__(
            'Cannot load the pi settings and sessions from %1: %2. The changes in this tab are not saved.',
            toContentsPath(AGENT_DIR),
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    );
  // The files that change while the folder loads are loaded after it.
  reloading = Promise.all([loadPrivate, loadDrive]).then(() => undefined);
  options.contents.fileChanged.connect(onDriveChange);
  await reloading;
  (fs as unknown as { onChange: (changed: string) => void }).onChange =
    onChange;
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      save();
    }
  });
  applyDefaults();
}

interface IRestoreOptions {
  contents: Contents.IManager;
  /**
   * The file operations on the drive.
   */
  drive: DriveOperations;
  translator?: ITranslator;
}

/**
 * Load the agent folder into the in-memory file system, then save each
 * changed file and take the files that change outside pi.
 */
export function restoreAgentDir(options: IRestoreOptions): Promise<void> {
  trans = (options.translator ?? nullTranslator).load('jupyterlite_ai');
  return (restoring ??= restore(options));
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
        // The agent folder is already in memory, with its unsaved changes.
        if (
          !SKIPPED_RESOURCES.has(entry.name) &&
          !isAgentPath(drivePath(entry.path))
        ) {
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
