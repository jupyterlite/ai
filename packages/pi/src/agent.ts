import type { IExternalRunContext } from '@jupyterlite/cockle';
import { Signal, type ISignal } from '@lumino/signaling';

import type * as Runtime from './runtime';
import type { IPiAgent } from './tokens';

/**
 * The pi agent of the page. The pi runtime loads on first use.
 */
export class PiAgent implements IPiAgent {
  constructor(options: Runtime.PiHost.IOptions) {
    this._options = options;
  }

  /**
   * Emitted when the credentials or models of pi change.
   */
  get configChanged(): ISignal<this, void> {
    return this._configChanged;
  }

  /**
   * The runtime module, once loaded.
   */
  get loadedRuntime(): typeof Runtime | undefined {
    return this._loadedRuntime;
  }

  /**
   * Load the runtime and its host; resolves once the agent folder is
   * restored. A failed import is tried again on the next call.
   */
  load(): Promise<{ runtime: typeof Runtime; host: Runtime.PiHost }> {
    this._loaded ??= import('./runtime').then(
      async runtime => {
        this._loadedRuntime = runtime;
        const host = new runtime.PiHost(this._options);
        host.configChanged.connect(() => this._configChanged.emit());
        await host.ready;
        return { runtime, host };
      },
      error => {
        this._loaded = undefined;
        throw error;
      }
    );
    return this._loaded;
  }

  async runTerminal(context: IExternalRunContext): Promise<number> {
    const controller = new AbortController();
    this._terminals.set(context.shellId, controller);
    // cockle never learns about a rejected command: the shell would hang.
    try {
      const { runtime, host } = await this.load();
      return await runtime.runTerminal(host, context, controller.signal);
    } catch (error) {
      context.stderr.write(
        `pi: ${error instanceof Error ? error.message : String(error)}\r\n`
      );
      return 1;
    } finally {
      if (this._terminals.get(context.shellId) === controller) {
        this._terminals.delete(context.shellId);
      }
      this._configChanged.emit();
    }
  }

  stopTerminal(shellId: string): void {
    this._terminals.get(shellId)?.abort();
  }

  /**
   * Run one of the credential dialogs of the runtime: an API key, an account
   * sign-in or an OpenAI-compatible endpoint.
   */
  async configure(
    action: 'setApiKey' | 'signIn' | 'addEndpoint'
  ): Promise<void> {
    const { runtime } = await this.load();
    await runtime[action]();
    this._configChanged.emit();
  }

  private _options: Runtime.PiHost.IOptions;
  private _loaded?: Promise<{ runtime: typeof Runtime; host: Runtime.PiHost }>;
  private _loadedRuntime?: typeof Runtime;
  private _terminals = new Map<string, AbortController>();
  private _configChanged = new Signal<this, void>(this);
}
