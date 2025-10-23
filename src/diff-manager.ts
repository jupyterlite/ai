import { CommandRegistry } from '@lumino/commands';
import { IDiffManager } from './tokens';
import { AISettingsModel } from './models/settings-model';

/**
 * Command IDs for unified cell diffs
 */
const UNIFIED_DIFF_COMMAND_ID = 'jupyterlab-diff:unified-cell-diff';

/**
 * Command IDs for split cell diffs
 */
const SPLIT_DIFF_COMMAND_ID = 'jupyterlab-diff:split-cell-diff';

/**
 * Implementation of the diff manager
 */
export class DiffManager implements IDiffManager {
  constructor(options: {
    commands: CommandRegistry;
    settingsModel: AISettingsModel;
  }) {
    this._commands = options.commands;
    this._settingsModel = options.settingsModel;
  }

  /**
   * Show diff between original and modified cell content
   */
  async showCellDiff(params: {
    original: string;
    modified: string;
    cellId?: string;
    showActionButtons?: boolean;
    openDiff?: boolean;
    notebookPath?: string;
  }): Promise<void> {
    if (!this._settingsModel.config.showDiff) {
      return;
    }

    const showDiffCommandId =
      this._settingsModel.config.diffDisplayMode === 'unified'
        ? UNIFIED_DIFF_COMMAND_ID
        : SPLIT_DIFF_COMMAND_ID;

    await this._commands.execute(showDiffCommandId, {
      originalSource: params.original,
      newSource: params.modified,
      cellId: params.cellId,
      showActionButtons: params.showActionButtons ?? true,
      openDiff: params.openDiff ?? true,
      notebookPath: params.notebookPath
    });
  }

  private _commands: CommandRegistry;
  private _settingsModel: AISettingsModel;
}
