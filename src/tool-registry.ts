import { ISignal, Signal } from '@lumino/signaling';
import { IToolRegistry, Tool } from './tokens';

export class ToolsRegistry implements IToolRegistry {
  /**
   * The registered tool names.
   */
  get toolNames(): string[] {
    return this._tools.map(tool => tool.name);
  }

  /**
   * A signal triggered when the tools has changed.
   */
  get toolsChanged(): ISignal<IToolRegistry, void> {
    return this._toolsChanged;
  }

  /**
   * Add a new tool to the registry.
   */
  add(tool: Tool): void {
    const index = this._tools.findIndex(t => t.name === tool.name);
    if (index === -1) {
      this._tools.push(tool);
      this._toolsChanged.emit();
    }
  }

  /**
   * Get a tool for a given name.
   * Return null if the name is not provided or if there is no registered tool with the
   * given name.
   */
  get(name: string | null): Tool | null {
    if (name === null) {
      return null;
    }
    return this._tools.find(t => t.name === name) || null;
  }

  private _tools: Tool[] = [];
  private _toolsChanged = new Signal<IToolRegistry, void>(this);
}
