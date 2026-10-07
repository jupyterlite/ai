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

import { AGENT_DIR, drivePath, toContentsPath } from './vfs';

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
 * Files of the pi agent folder with credentials, which the tools cannot reach.
 */
const PROTECTED_FILES = new Set([
  'auth.json',
  'models.json',
  'models-store.json'
]);

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

function errorCode(error: unknown): string | undefined {
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
  const normalized = path.posix.normalize(absolutePath);
  if (
    path.posix.dirname(normalized) === AGENT_DIR &&
    PROTECTED_FILES.has(path.posix.basename(normalized))
  ) {
    throw fsError('EACCES', absolutePath);
  }
  return normalized;
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
  constructor(
    contents: Contents.IManager,
    options: DriveOperations.IOptions = {}
  ) {
    this._contents = contents;
    this._onWrite = options.onWrite;
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
      const model = await this._get(absolutePath, contentsPath, {
        content: true,
        type: 'notebook',
        format: 'json'
      });
      return Buffer.from(JSON.stringify(model.content, null, 1), 'utf-8');
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
    this._listings.clear();
    await this._contents.save(
      contentsPath,
      isNotebook(absolutePath)
        ? { type: 'notebook', format: 'json', content: JSON.parse(content) }
        : { type: 'file', format: 'text', content }
    );
    this._onWrite?.(contentsPath);
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
        await this._contents.save(current, { type: 'directory' });
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
    const entries = await this._list(absolutePath, contentsPath);
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
   * at its entry limit or after `timeout` milliseconds.
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
    const queue: string[] = [rootContentsPath];
    let count = 0;
    while (queue.length) {
      if (options.signal?.aborted) {
        throw new Error('Operation aborted');
      }
      if (count >= MAX_WALK_ENTRIES) {
        return `walk limit of ${MAX_WALK_ENTRIES} entries reached, results may be incomplete`;
      }
      if (Date.now() > deadline) {
        return `walk time limit of ${options.timeout! / 1000} s reached, results may be incomplete`;
      }
      const current = queue.shift()!;
      let entries: Contents.IModel[];
      try {
        entries = await this._list(drivePath(current), current);
      } catch (error) {
        if (current === rootContentsPath) {
          throw error;
        }
        continue;
      }
      for (const entry of entries) {
        count++;
        if (
          entry.type === 'directory' &&
          !SKIPPED_DIRECTORIES.has(entry.name)
        ) {
          queue.push(entry.path);
        }
        if (visit(drivePath(entry.path), entry)) {
          return undefined;
        }
      }
    }
    return undefined;
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

  private async _list(
    absolutePath: string,
    contentsPath: string
  ): Promise<Contents.IModel[]> {
    const model = await this._get(absolutePath, contentsPath, {
      content: true
    });
    if (model.type !== 'directory') {
      throw fsError('ENOTDIR', absolutePath);
    }
    return (model.content ?? []) as Contents.IModel[];
  }

  private async _get(
    absolutePath: string,
    contentsPath: string,
    options: Contents.IFetchOptions
  ): Promise<Contents.IModel> {
    try {
      return await this._contents.get(contentsPath, options);
    } catch (error) {
      throw contentsError(error, absolutePath);
    }
  }

  private _contents: Contents.IManager;
  private _onWrite?: (contentsPath: string) => void;
  private _listings = new Map<
    string,
    { time: number; types: Map<string, string> }
  >();
}

export namespace DriveOperations {
  export interface IOptions {
    /**
     * Called after each write of a drive file, with its contents path.
     */
    onWrite?: (contentsPath: string) => void;
  }
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
          { signal }
        );
      }
      const output: string[] = [];
      let matches = 0;
      for (const file of files) {
        if (signal?.aborted) {
          throw new Error('Operation aborted');
        }
        if (matches >= limit) {
          break;
        }
        if (imageType(file)) {
          continue;
        }
        let text: string;
        try {
          text = (await operations.readFile(file)).toString('utf-8');
        } catch {
          continue;
        }
        if (text.includes('\u0000')) {
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
      const text = output.length ? truncation.content : 'No matches found';
      const suffix = notices.length ? `\n\n[${notices.join('. ')}]` : '';
      return {
        content: [{ type: 'text', text: text + suffix }],
        details: undefined
      };
    }
  };
}
