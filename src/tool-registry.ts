import { ISignal, Signal } from '@lumino/signaling';
import { IToolRegistry, Tool } from './tokens';

export class ToolsRegistry implements IToolRegistry {
  get toolNames(): string[] {
    return this._tools.map(tool => tool.name);
  }

  get toolsChanged(): ISignal<IToolRegistry, void> {
    return this._toolsChanged;
  }

  add(tool: Tool): void {
    const index = this._tools.findIndex(t => t.name === tool.name);
    if (index === -1) {
      this._tools.push(tool);
      this._toolsChanged.emit();
    }
  }

  private _tools: Tool[] = [];
  private _toolsChanged = new Signal<IToolRegistry, void>(this);
}
