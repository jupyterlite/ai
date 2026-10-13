import {
  createFindToolDefinition,
  createGrepToolDefinition,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateLine,
  type EditOperations,
  type FindOperations,
  type LsOperations,
  type ReadOperations,
  type WriteOperations
} from '@earendil-works/pi-coding-agent';
import type { Contents } from '@jupyterlab/services';
import fs from 'fs';
import { minimatch } from 'minimatch';
import { resolveToCwd } from 'pi-coding-agent-package/dist/core/tools/path-utils.js';
import path from 'path';

import {
  DRIVE,
  drivePath,
  isAgentPath,
  isPrivateFile,
  toContentsPath
} from './vfs';

const IMAGE_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.ipynb_checkpoints',
  '__pycache__',
  'node_modules'
]);
/**
 * Entries of a Python environment (venv, conda): the walk does not go below
 * one, as pi's ripgrep skips them through .gitignore.
 */
const ENVIRONMENT_MARKERS = new Set(['conda-meta', 'pyvenv.cfg']);
const MAX_WALK_ENTRIES = 20000;
/**
 * The find tool of pi cannot stop a glob: it ends on its own after this time.
 */
const GLOB_TIMEOUT_MS = 20000;
/**
 * The ls tool lists a directory, then gets the type of each entry: the
 * listing answers these calls for a short time only, files change outside pi.
 */
const LISTING_TTL_MS = 2000;
const MAX_GREP_FILE_SIZE = 1024 * 1024;
const DEFAULT_GREP_LIMIT = 100;
/**
 * grep lists the files, then reads them, each for at most this time: on a
 * remote server, a large tree takes minutes.
 */
const GREP_TIMEOUT_MS = 20000;
/**
 * The files that grep reads at the same time: browsers open 6 connections to
 * a server.
 */
const GREP_READERS = 6;

const FS_ERRORS = {
  EACCES: 'permission denied',
  EISDIR: 'illegal operation on a directory',
  ENOENT: 'no such file or directory',
  ENOTDIR: 'not a directory'
};

function fsError(code: keyof typeof FS_ERRORS, target: string): Error {
  return Object.assign(new Error(`${code}: ${FS_ERRORS[code]}, '${target}'`), {
    code
  });
}

export function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/**
 * The file system error of a failed contents request. JupyterLite throws
 * plain errors, a Jupyter server responds with an HTTP status.
 */
function contentsError(error: unknown, absolutePath: string): unknown {
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (
    status === 404 ||
    (status === undefined && /could not find|does not exist/i.test(message))
  ) {
    return fsError('ENOENT', absolutePath);
  }
  if (status === 400 && /is a directory/i.test(message)) {
    return fsError('EISDIR', absolutePath);
  }
  return error;
}

/**
 * A path of the in-memory file system, unless it holds credentials.
 */
function localPath(absolutePath: string): string {
  checkPrivate(absolutePath);
  return path.posix.normalize(absolutePath);
}

/**
 * Refuse the credentials of the agent folder: they stay in the browser, and
 * the tools cannot read them or write a file in their place.
 */
export function checkPrivate(absolutePath: string): void {
  if (isPrivateFile(absolutePath)) {
    throw fsError('EACCES', absolutePath);
  }
}

/**
 * The text of a file model; JupyterLite parses the JSON files of the site.
 */
function fileText(model: Contents.IModel): string {
  return typeof model.content === 'string'
    ? model.content
    : JSON.stringify(model.content ?? '', null, 2);
}

function isNotebook(absolutePath: string): boolean {
  return absolutePath.endsWith('.ipynb');
}

function imageType(absolutePath: string): string | undefined {
  return IMAGE_TYPES[path.posix.extname(absolutePath).toLowerCase()];
}

/**
 * A glob matcher with the rules of fd in pi's find tool: a pattern with a
 * slash matches the full path, other patterns match the name.
 */
function findMatcher(pattern: string): (absolutePath: string) => boolean {
  if (!pattern.includes('/')) {
    return absolutePath =>
      minimatch(path.posix.basename(absolutePath), pattern, { dot: true });
  }
  const full =
    pattern.startsWith('/') || pattern.startsWith('**/') || pattern === '**'
      ? pattern
      : `**/${pattern}`;
  return absolutePath => minimatch(absolutePath, full, { dot: true });
}

/**
 * File system operations of the pi tools: the drive goes through the
 * JupyterLab contents API, other paths to the in-memory file system of pi.
 */
export class DriveOperations
  implements
    ReadOperations,
    WriteOperations,
    EditOperations,
    LsOperations,
    FindOperations
{
  /**
   * `onWrite` is called after each write of a drive file, with its contents
   * path.
   */
  constructor(
    contents: Contents.IManager,
    onWrite?: (contentsPath: string) => void
  ) {
    this._contents = contents;
    this._onWrite = onWrite;
  }

  access = async (absolutePath: string): Promise<void> => {
    const contentsPath = toContentsPath(absolutePath);
    if (contentsPath === null) {
      await fs.promises.access(localPath(absolutePath));
      return;
    }
    await this._get(absolutePath, contentsPath, { content: false });
  };

  readFile = async (absolutePath: string): Promise<Buffer> => {
    const contentsPath = toContentsPath(absolutePath);
    if (contentsPath === null) {
      return (await fs.promises.readFile(localPath(absolutePath))) as Buffer;
    }
    if (isNotebook(absolutePath)) {
      try {
        const model = await this._get(absolutePath, contentsPath, {
          content: true,
          type: 'notebook',
          format: 'json'
        });
        return Buffer.from(JSON.stringify(model.content, null, 1), 'utf-8');
      } catch (error) {
        // A notebook that is not valid JSON (merge conflict markers) is read
        // and written as text until it is valid again.
        if (errorCode(error)) {
          throw error;
        }
        this._textNotebooks.add(contentsPath);
      }
    }
    const model = await this._get(absolutePath, contentsPath, {
      content: true,
      type: 'file',
      ...(imageType(absolutePath) ? { format: 'base64' as const } : {})
    });
    if (model.type === 'directory') {
      throw fsError('EISDIR', absolutePath);
    }
    return Buffer.from(
      fileText(model),
      model.format === 'base64' ? 'base64' : 'utf-8'
    );
  };

  detectImageMimeType = async (absolutePath: string) => imageType(absolutePath);

  writeFile = async (absolutePath: string, content: string): Promise<void> => {
    const contentsPath = toContentsPath(absolutePath);
    if (contentsPath === null) {
      await fs.promises.writeFile(localPath(absolutePath), content);
      return;
    }
    if (!contentsPath) {
      throw fsError('EISDIR', absolutePath);
    }
    checkPrivate(absolutePath);
    this._listings.clear();
    let notebook: unknown;
    if (isNotebook(absolutePath)) {
      try {
        notebook = JSON.parse(content);
        this._textNotebooks.delete(contentsPath);
      } catch (error) {
        if (!this._textNotebooks.has(contentsPath)) {
          throw error;
        }
      }
    }
    await this._contents.save(
      contentsPath,
      notebook === undefined
        ? { type: 'file', format: 'text', content }
        : { type: 'notebook', format: 'json', content: notebook }
    );
    this._onWrite?.(contentsPath);
  };

  /**
   * Delete a file or a folder of the drive.
   */
  remove = async (absolutePath: string): Promise<void> => {
    const contentsPath = toContentsPath(absolutePath);
    if (!contentsPath) {
      throw fsError('EACCES', absolutePath);
    }
    this._listings.clear();
    try {
      await this._contents.delete(contentsPath);
    } catch (error) {
      throw contentsError(error, absolutePath);
    }
  };

  mkdir = async (directory: string): Promise<void> => {
    const contentsPath = toContentsPath(directory);
    if (contentsPath === null) {
      await fs.promises.mkdir(localPath(directory), { recursive: true });
      return;
    }
    this._listings.clear();
    let current = '';
    for (const part of contentsPath.split('/').filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      const model = await this._get(drivePath(current), current, {
        content: false
      }).catch(error => {
        if (errorCode(error) !== 'ENOENT') {
          throw error;
        }
      });
      if (!model) {
        await this._contents
          .save(current, { type: 'directory' })
          .catch(async error => {
            // A parallel write can create the folder first: a Jupyter server
            // then fails.
            const created = await this._get(drivePath(current), current, {
              content: false
            }).catch(() => undefined);
            if (created?.type !== 'directory') {
              throw error;
            }
          });
      } else if (model.type !== 'directory') {
        throw fsError('ENOTDIR', drivePath(current));
      }
    }
  };

  exists = async (absolutePath: string): Promise<boolean> => {
    try {
      await this.access(absolutePath);
      return true;
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return false;
      }
      throw error;
    }
  };

  stat = async (
    absolutePath: string
  ): Promise<{ isDirectory: () => boolean }> => {
    const contentsPath = toContentsPath(absolutePath);
    if (contentsPath === null) {
      return fs.promises.stat(localPath(absolutePath));
    }
    const type =
      this._listedType(contentsPath) ??
      (await this._get(absolutePath, contentsPath, { content: false })).type;
    return { isDirectory: () => type === 'directory' };
  };

  readdir = async (absolutePath: string): Promise<string[]> => {
    const contentsPath = toContentsPath(absolutePath);
    if (contentsPath === null) {
      return (await fs.promises.readdir(localPath(absolutePath))) as string[];
    }
    const entries = await this.list(contentsPath);
    const now = Date.now();
    for (const [key, listing] of this._listings) {
      if (now - listing.time >= LISTING_TTL_MS) {
        this._listings.delete(key);
      }
    }
    this._listings.set(contentsPath, {
      time: now,
      types: new Map(entries.map(entry => [entry.name, entry.type]))
    });
    return entries.map(entry => entry.name);
  };

  glob = async (
    pattern: string,
    cwd: string,
    options: { ignore: string[]; limit: number }
  ): Promise<string[]> => {
    const matches = findMatcher(pattern);
    const results: string[] = [];
    const notice = await this.walk(
      cwd,
      (absolutePath, entry) => {
        const target =
          entry.type === 'directory' ? `${absolutePath}/` : absolutePath;
        if (
          options.ignore.some(ignore =>
            minimatch(target, ignore, { dot: true })
          )
        ) {
          return;
        }
        if (matches(absolutePath)) {
          results.push(target);
        }
        return results.length >= options.limit;
      },
      { timeout: GLOB_TIMEOUT_MS }
    );
    if (notice) {
      // pi's find tool prints each result on its own line.
      results.push(`[${notice}]`);
    }
    return results;
  };

  /**
   * Visit the files and directories below a drive directory, breadth first,
   * until `visit` returns true. Resolves with a notice when the walk stopped
   * at its entry limit or after `timeout` milliseconds. The walk enters the
   * agent folder (its sessions) only from a root inside it.
   */
  async walk(
    root: string,
    visit: (absolutePath: string, entry: Contents.IModel) => boolean | void,
    options: { signal?: AbortSignal; timeout?: number } = {}
  ): Promise<string | undefined> {
    const rootContentsPath = toContentsPath(root);
    if (rootContentsPath === null) {
      throw fsError('ENOENT', root);
    }
    const deadline = Date.now() + (options.timeout ?? Infinity);
    const inAgentDir = isAgentPath(path.posix.normalize(root));
    const queue: string[] = [rootContentsPath];
    const skipped: string[] = [];
    const notice = (stop?: string) => {
      const notices = stop ? [stop] : [];
      if (skipped.length) {
        notices.push(
          `did not search inside the Python environments ${skipped.join(', ')} (give one as the path to search it)`
        );
      }
      return notices.join('. ') || undefined;
    };
    let count = 0;
    while (queue.length) {
      if (options.signal?.aborted) {
        throw new Error('Operation aborted');
      }
      if (count >= MAX_WALK_ENTRIES) {
        return notice(
          `walk limit of ${MAX_WALK_ENTRIES} entries reached, results may be incomplete`
        );
      }
      if (Date.now() > deadline) {
        return notice(
          `walk time limit of ${options.timeout! / 1000} s reached, results may be incomplete`
        );
      }
      const current = queue.shift()!;
      let entries: Contents.IModel[];
      try {
        entries = await this.list(current);
      } catch (error) {
        if (current === rootContentsPath) {
          throw error;
        }
        continue;
      }
      const environment =
        current !== rootContentsPath &&
        entries.some(entry => ENVIRONMENT_MARKERS.has(entry.name));
      if (environment) {
        skipped.push(current);
      }
      for (const entry of entries) {
        count++;
        if (
          entry.type === 'directory' &&
          !environment &&
          !SKIPPED_DIRECTORIES.has(entry.name) &&
          (inAgentDir || !isAgentPath(drivePath(entry.path)))
        ) {
          queue.push(entry.path);
        }
        if (visit(drivePath(entry.path), entry)) {
          return notice();
        }
      }
    }
    return notice();
  }

  /**
   * The entries of a drive directory, with their types, in one request.
   */
  async list(contentsPath: string): Promise<Contents.IModel[]> {
    const absolutePath = drivePath(contentsPath);
    const model = await this._get(absolutePath, contentsPath, {
      content: true
    });
    if (model.type !== 'directory') {
      throw fsError('ENOTDIR', absolutePath);
    }
    return (model.content ?? []) as Contents.IModel[];
  }

  /**
   * The type of an entry of a recent directory listing.
   */
  private _listedType(contentsPath: string): string | undefined {
    const listing = this._listings.get(
      path.posix.dirname(contentsPath).replace(/^\.$/, '')
    );
    if (!listing || Date.now() - listing.time >= LISTING_TTL_MS) {
      return undefined;
    }
    return listing.types.get(path.posix.basename(contentsPath));
  }

  private async _get(
    absolutePath: string,
    contentsPath: string,
    options: Contents.IFetchOptions
  ): Promise<Contents.IModel> {
    checkPrivate(absolutePath);
    try {
      return await this._contents.get(contentsPath, options);
    } catch (error) {
      throw contentsError(error, absolutePath);
    }
  }

  private _contents: Contents.IManager;
  private _onWrite?: (contentsPath: string) => void;
  private _textNotebooks = new Set<string>();
  private _listings = new Map<
    string,
    { time: number; types: Map<string, string> }
  >();
}

/**
 * The file suggestions of pi's editor (`@`, Tab) list the drive at most this
 * often.
 */
export const SUGGESTION_TTL_MS = 5000;
const MAX_SUGGESTION_ENTRIES = 5000;
const SUGGESTION_TIMEOUT_MS = 3000;

/**
 * The `fd` command of pi's file suggestions, on the drive: the options that
 * pi passes, a regular expression on the name (on the path with
 * `--full-path`), smart case, and directories with a trailing slash.
 */
export function fdCommand(
  operations: DriveOperations
): (args: string[]) => Promise<string> {
  let cache: { root: string; time: number; entries: Promise<string[]> };
  const list = (root: string) => {
    if (cache?.root !== root || Date.now() - cache.time > SUGGESTION_TTL_MS) {
      const entries: string[] = [];
      cache = {
        root,
        time: Date.now(),
        entries: operations
          .walk(
            root,
            (absolutePath, entry) => {
              const relative = path.posix.relative(root, absolutePath);
              entries.push(
                entry.type === 'directory' ? `${relative}/` : relative
              );
              return entries.length >= MAX_SUGGESTION_ENTRIES;
            },
            { timeout: SUGGESTION_TIMEOUT_MS }
          )
          .then(() => entries)
      };
    }
    return cache.entries;
  };
  return async args => {
    let root = DRIVE;
    let maxResults = Infinity;
    let maxDepth = Infinity;
    let fullPath = false;
    let pattern = '';
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--base-directory') {
        root = path.posix.resolve(DRIVE, args[++i]);
      } else if (arg === '--max-results') {
        maxResults = Number(args[++i]);
      } else if (arg === '--max-depth') {
        maxDepth = Number(args[++i]);
      } else if (arg === '--type' || arg === '--exclude') {
        i++;
      } else if (arg === '--full-path') {
        fullPath = true;
      } else if (!arg.startsWith('-')) {
        pattern = arg;
      }
    }
    const matches = new RegExp(pattern, /[A-Z]/.test(pattern) ? '' : 'i');
    return (await list(root))
      .filter(entry => {
        const relative = entry.replace(/\/$/, '');
        return (
          relative.split('/').length <= maxDepth &&
          matches.test(
            fullPath ? `${root}/${relative}` : path.posix.basename(relative)
          )
        );
      })
      .slice(0, maxResults)
      .join('\n');
  };
}

/**
 * The find tool of pi on the drive, which does not read .gitignore.
 */
export function createFindTool(
  cwd: string,
  operations: DriveOperations
): ReturnType<typeof createFindToolDefinition> {
  const tool = createFindToolDefinition(cwd, { operations });
  return {
    ...tool,
    description: tool.description.replace(' Respects .gitignore.', ''),
    promptSnippet: 'Find files by glob pattern'
  };
}

/**
 * The grep tool of pi, searching the drive with JavaScript regular
 * expressions (pi's own grep needs ripgrep).
 */
export function createGrepTool(
  cwd: string,
  operations: DriveOperations
): ReturnType<typeof createGrepToolDefinition> {
  return {
    ...createGrepToolDefinition(cwd),
    description: `Search file contents for a pattern (JavaScript regular expression). Returns matching lines with file paths and line numbers. Output is truncated to ${DEFAULT_GREP_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
    promptSnippet: 'Search file contents for patterns',
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const base = ctx?.cwd || cwd;
      const root = resolveToCwd(params.path || '.', base);
      const limit = Math.max(1, params.limit ?? DEFAULT_GREP_LIMIT);
      const context = Math.max(0, Math.floor(params.context ?? 0));
      const regex = new RegExp(
        params.literal
          ? params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          : params.pattern,
        params.ignoreCase ? 'i' : ''
      );
      const files: string[] = [];
      let walkNotice: string | undefined;
      if (!(await operations.stat(root)).isDirectory()) {
        files.push(root);
      } else {
        walkNotice = await operations.walk(
          root,
          (absolutePath, entry) => {
            if (
              entry.type === 'directory' ||
              (entry.size ?? 0) > MAX_GREP_FILE_SIZE
            ) {
              return;
            }
            const relative = path.posix.relative(root, absolutePath);
            if (
              !params.glob ||
              minimatch(relative, params.glob, { dot: true, matchBase: true })
            ) {
              files.push(absolutePath);
            }
          },
          { signal, timeout: GREP_TIMEOUT_MS }
        );
      }
      const read = (file: string): Promise<string | undefined> =>
        imageType(file)
          ? Promise.resolve(undefined)
          : operations.readFile(file).then(
              data => data.toString('utf-8'),
              () => undefined
            );
      // The reads run ahead of the search, which keeps the order of the files.
      const reads = files.slice(0, GREP_READERS).map(read);
      const deadline = Date.now() + GREP_TIMEOUT_MS;
      let timedOut = false;
      const output: string[] = [];
      let matches = 0;
      for (const [position, file] of files.entries()) {
        if (signal?.aborted) {
          throw new Error('Operation aborted');
        }
        if (matches >= limit) {
          break;
        }
        if (Date.now() > deadline) {
          timedOut = true;
          break;
        }
        const text = await reads.shift();
        if (position + GREP_READERS < files.length) {
          reads.push(read(files[position + GREP_READERS]));
        }
        if (text === undefined || text.includes('\u0000')) {
          continue;
        }
        const lines = text.split('\n');
        const display = path.posix.relative(base, file) || file;
        for (let index = 0; index < lines.length && matches < limit; index++) {
          if (!regex.test(lines[index])) {
            continue;
          }
          matches++;
          const start = Math.max(0, index - context);
          const end = Math.min(lines.length - 1, index + context);
          for (let current = start; current <= end; current++) {
            const separator = current === index ? ':' : '-';
            const { text: line } = truncateLine(
              lines[current].replace(/\r/g, '')
            );
            output.push(
              `${display}${separator}${current + 1}${separator} ${line}`
            );
          }
        }
      }
      const notices: string[] = [];
      if (matches >= limit) {
        notices.push(`${limit} matches limit reached`);
      }
      const truncation = truncateHead(output.join('\n'), {
        maxLines: Number.MAX_SAFE_INTEGER
      });
      if (truncation.truncated) {
        notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
      }
      if (walkNotice) {
        notices.push(walkNotice);
      }
      if (timedOut) {
        notices.push(
          `read time limit of ${GREP_TIMEOUT_MS / 1000} s reached, results may be incomplete`
        );
      }
      const text = output.length ? truncation.content : 'No matches found';
      const suffix = notices.length ? `\n\n[${notices.join('. ')}]` : '';
      return {
        content: [{ type: 'text', text: text + suffix }],
        details: undefined
      };
    }
  };
}
