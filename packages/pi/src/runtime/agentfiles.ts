import type { Contents } from '@jupyterlab/services';
import fs from 'fs';
import path from 'path';

import { AGENT_DIR } from './vfs';

/**
 * The credentials stay out of the drive: the file commands of the AI agents
 * take contents paths. The provider dialog and `/login` manage them.
 */
const CREDENTIALS = path.posix.join(AGENT_DIR, 'auth.json');

/**
 * The absolute path of a path in the agent folder; it cannot leave it.
 */
function absolute(localPath: string): string {
  const file = path.posix.join(AGENT_DIR, localPath);
  if (
    (file !== AGENT_DIR && !file.startsWith(`${AGENT_DIR}/`)) ||
    file === CREDENTIALS
  ) {
    throw new Error(`Invalid path: ${localPath}`);
  }
  return file;
}

function toModel(file: string, content: boolean): Contents.IModel {
  const stats = fs.statSync(file);
  const localPath = path.posix.relative(AGENT_DIR, file);
  const common = {
    name: path.posix.basename(localPath),
    path: localPath,
    created: stats.birthtime.toISOString(),
    last_modified: stats.mtime.toISOString(),
    writable: true
  };
  if (stats.isDirectory()) {
    return {
      ...common,
      type: 'directory',
      mimetype: '',
      format: content ? 'json' : null,
      content: content
        ? fs
            .readdirSync(file)
            .map(name => path.posix.join(file, name))
            .filter(child => child !== CREDENTIALS)
            .map(child => toModel(child, false))
        : null
    };
  }
  return {
    ...common,
    type: 'file',
    mimetype: 'text/plain',
    size: stats.size,
    format: content ? 'text' : null,
    content: content ? fs.readFileSync(file, 'utf8') : null
  };
}

/**
 * The first free path of a directory, from a name for each attempt.
 */
function freePath(directory: string, name: (index: number) => string): string {
  for (let index = 0; ; index++) {
    const localPath = path.posix.join(directory, name(index));
    if (!fs.existsSync(absolute(localPath))) {
      return localPath;
    }
  }
}

/**
 * The file operations of the `pi` drive on the agent folder. The files go
 * through the fs shim, which saves them in IndexedDB.
 */
export class AgentFiles {
  async get(
    localPath: string,
    options?: Contents.IFetchOptions
  ): Promise<Contents.IModel> {
    return toModel(absolute(localPath), options?.content !== false);
  }

  async getDownloadUrl(localPath: string): Promise<string> {
    const data = fs.readFileSync(absolute(localPath));
    return URL.createObjectURL(new Blob([data]));
  }

  async newUntitled(
    options: Contents.ICreateOptions = {}
  ): Promise<Contents.IModel> {
    const directory = options.path ?? '';
    if (options.type === 'directory') {
      const localPath = freePath(
        directory,
        index => `Untitled Folder${index ? ` ${index}` : ''}`
      );
      fs.mkdirSync(absolute(localPath));
      return this.get(localPath, { content: false });
    }
    let ext = options.ext ?? '';
    if (ext && !ext.startsWith('.')) {
      ext = `.${ext}`;
    }
    const localPath = freePath(
      directory,
      index => `untitled${index || ''}${ext}`
    );
    fs.writeFileSync(absolute(localPath), '');
    return this.get(localPath, { content: false });
  }

  async delete(localPath: string): Promise<void> {
    fs.rmSync(absolute(localPath), { recursive: true });
  }

  async rename(
    oldLocalPath: string,
    newLocalPath: string
  ): Promise<Contents.IModel> {
    const target = absolute(newLocalPath);
    if (fs.existsSync(target)) {
      throw new Error(`File already exists: ${newLocalPath}`);
    }
    fs.renameSync(absolute(oldLocalPath), target);
    return this.get(newLocalPath, { content: false });
  }

  async save(
    localPath: string,
    options: Partial<Contents.IModel> = {}
  ): Promise<Contents.IModel> {
    const file = absolute(localPath);
    if (options.type === 'directory') {
      fs.mkdirSync(file, { recursive: true });
    } else {
      const { content = '', format, chunk } = options;
      const data =
        format === 'base64'
          ? Buffer.from(content, 'base64')
          : typeof content === 'string'
            ? content
            : JSON.stringify(content, null, 2);
      // The agent folder is saved as text: a binary file breaks on reload. A
      // chunk can end inside a character, the last chunk checks the file.
      if (format === 'base64' && (!chunk || chunk === -1)) {
        const bytes = data as Buffer;
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(
            chunk ? Buffer.concat([fs.readFileSync(file), bytes]) : bytes
          );
        } catch {
          if (chunk) {
            fs.rmSync(file, { force: true });
          }
          throw new Error(`Only text files can be uploaded: ${localPath}`);
        }
      }
      // The file browser uploads a file above 1 MB in chunks.
      if (chunk && chunk !== 1) {
        fs.appendFileSync(file, data);
      } else {
        fs.writeFileSync(file, data);
      }
    }
    return this.get(localPath, { content: false });
  }

  async copy(localPath: string, toLocalDir: string): Promise<Contents.IModel> {
    const ext = path.posix.extname(localPath);
    const base = path.posix.basename(localPath, ext);
    const target = freePath(
      toLocalDir,
      index => `${base}-Copy${index + 1}${ext}`
    );
    fs.copyFileSync(absolute(localPath), absolute(target));
    return this.get(target, { content: false });
  }
}
