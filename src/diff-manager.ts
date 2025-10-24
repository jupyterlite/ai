import { CommandRegistry } from '@lumino/commands';
import { AISettingsModel } from './models/settings-model';
import {
  IDiffManager,
  IShowCellDiffParams,
  IShowFileDiffParams
} from './tokens';

/**
 * Command IDs for unified cell diffs
 */
const UNIFIED_DIFF_COMMAND_ID = 'jupyterlab-diff:unified-cell-diff';

/**
 * Command IDs for split cell diffs
 */
const SPLIT_DIFF_COMMAND_ID = 'jupyterlab-diff:split-cell-diff';

/**
 * Command ID for unified file diffs
 */
const UNIFIED_FILE_DIFF_COMMAND_ID = 'jupyterlab-diff:unified-file-diff';

/**
 * Implementation of the diff manager
 */
export class DiffManager implements IDiffManager {
  /**
   * Construct a new DiffManager
   */
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
  async showCellDiff(params: IShowCellDiffParams): Promise<void> {
    if (!this._settingsModel.config.showCellDiff) {
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

  /**
   * Show diff between original and modified file content
   */
  async showFileDiff(params: IShowFileDiffParams): Promise<void> {
    if (!this._settingsModel.config.showFileDiff) {
      return;
    }

    // File diffs only support unified view
    await this._commands.execute(UNIFIED_FILE_DIFF_COMMAND_ID, {
      originalSource: params.original,
      newSource: params.modified,
      filePath: params.filePath,
      showActionButtons: params.showActionButtons ?? true
    });
  }

  private _commands: CommandRegistry;
  private _settingsModel: AISettingsModel;
}
