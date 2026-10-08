import type { CommandRegistry } from '@lumino/commands';

import type {
  IPersonaControl,
  IPersonaControlProps
} from '@jupyter-ai/persona-manager';

import { TooltippedButton } from '@jupyter/chat';

import type { TranslationBundle } from '@jupyterlab/translation';

import SettingsIcon from '@mui/icons-material/Settings';

import React from 'react';

import { CommandIds, DEFAULT_PERSONA } from '../tokens';

/**
 * Factory function returning an IPersonaControl for opening AI settings.
 */
export function createSettingsButtonControl(
  commands: CommandRegistry,
  translator: TranslationBundle
): IPersonaControl {
  const SettingsButton: React.FunctionComponent<IPersonaControlProps> = () => (
    <TooltippedButton
      onClick={() => {
        if (commands.hasCommand(CommandIds.openSettings)) {
          void commands.execute(CommandIds.openSettings);
        }
      }}
      tooltip={translator.__('Open AI Settings')}
      buttonProps={{ title: translator.__('Open AI Settings') }}
    >
      <SettingsIcon sx={{ fontSize: 'small' }} />
    </TooltippedButton>
  );

  return {
    id: 'jupyternaut-settings',
    component: SettingsButton,
    personaId: DEFAULT_PERSONA.username,
    rank: 20
  };
}
