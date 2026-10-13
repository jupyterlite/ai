import type { Contents, ServerConnection } from '@jupyterlab/services';
import { Signal, type ISignal } from '@lumino/signaling';

import type { PiAgent } from './agent';
import type * as Runtime from './runtime';
import { AGENT_DRIVE } from './tokens';

/**
 * The pi agent folder (`~/.pi/agent`) as the `pi` drive of JupyterLab. The
 * pi runtime loads on first use.
 */
export class AgentFolderDrive implements Contents.IDrive {
  constructor(agent: PiAgent, serverSettings: ServerConnection.ISettings) {
    this._agent = agent;
    this.serverSettings = serverSettings;
  }

  readonly name = AGENT_DRIVE;
  readonly serverSettings: ServerConnection.ISettings;

  get fileChanged(): ISignal<this, Contents.IChangedArgs> {
    return this._fileChanged;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    this._isDisposed = true;
    Signal.clearData(this);
  }

  async get(
    localPath: string,
    options?: Contents.IFetchOptions
  ): Promise<Contents.IModel> {
    return (await this._files()).get(localPath, options);
  }

  async getDownloadUrl(localPath: string): Promise<string> {
    return (await this._files()).getDownloadUrl(localPath);
  }

  async newUntitled(
    options?: Contents.ICreateOptions
  ): Promise<Contents.IModel> {
    const model = await (await this._files()).newUntitled(options);
    this._fileChanged.emit({ type: 'new', oldValue: null, newValue: model });
    return model;
  }

  async delete(localPath: string): Promise<void> {
    await (await this._files()).delete(localPath);
    this._fileChanged.emit({
      type: 'delete',
      oldValue: { path: localPath },
      newValue: null
    });
  }

  async rename(
    oldLocalPath: string,
    newLocalPath: string
  ): Promise<Contents.IModel> {
    const model = await (
      await this._files()
    ).rename(oldLocalPath, newLocalPath);
    this._fileChanged.emit({
      type: 'rename',
      oldValue: { path: oldLocalPath },
      newValue: model
    });
    return model;
  }

  async save(
    localPath: string,
    options?: Partial<Contents.IModel>
  ): Promise<Contents.IModel> {
    const model = await (await this._files()).save(localPath, options);
    this._fileChanged.emit({ type: 'save', oldValue: null, newValue: model });
    return model;
  }

  async copy(localPath: string, toLocalDir: string): Promise<Contents.IModel> {
    const model = await (await this._files()).copy(localPath, toLocalDir);
    this._fileChanged.emit({ type: 'new', oldValue: null, newValue: model });
    return model;
  }

  /**
   * The agent folder keeps no checkpoints.
   */
  async createCheckpoint(): Promise<Contents.ICheckpointModel> {
    return { id: 'checkpoint', last_modified: new Date().toISOString() };
  }

  async listCheckpoints(): Promise<Contents.ICheckpointModel[]> {
    return [];
  }

  async restoreCheckpoint(): Promise<void> {}

  async deleteCheckpoint(): Promise<void> {}

  private async _files(): Promise<Runtime.AgentFiles> {
    const { runtime } = await this._agent.load();
    return new runtime.AgentFiles();
  }

  private _agent: PiAgent;
  private _isDisposed = false;
  private _fileChanged = new Signal<this, Contents.IChangedArgs>(this);
}
