import { ISignal, Signal } from '@lumino/signaling';
import { ITool, IToolRegistry, INamedTool } from '../tokens';

/**
 * Implementation of the tool registry for managing AI tools
 */
export class ToolRegistry implements IToolRegistry {
  /**
   * The registered tools as a record (name -> tool mapping).
   */
  get tools(): Record<string, ITool> {
    return { ...this._tools }; // Return a copy to prevent external modification
  }

  /**
   * The registered named tools array.
   */
  get namedTools(): INamedTool[] {
    return Object.entries(this._tools).map(([name, tool]) => ({ name, tool }));
  }

  /**
   * A signal triggered when the tools have changed.
   */
  get toolsChanged(): ISignal<IToolRegistry, void> {
    return this._toolsChanged;
  }

  /**
   * Add a new tool to the registry.
   */
  add(name: string, tool: ITool): void {
    this._tools[name] = tool;
    this._toolsChanged.emit();
  }

  /**
   * Get a tool for a given name.
   * Return null if the name is not provided or if there is no registered tool with the
   * given name.
   */
  get(name: string | null): ITool | null {
    if (name === null) {
      return null;
    }
    return this._tools[name] || null;
  }

  /**
   * Remove a tool from the registry by name.
   */
  remove(name: string): boolean {
    if (name in this._tools) {
      delete this._tools[name];
      this._toolsChanged.emit();
      return true;
    }
    return false;
  }

  private _tools: Record<string, ITool> = {};
  private _toolsChanged = new Signal<IToolRegistry, void>(this);
}
