/**
 * TODO: reuse from Jupyter AI instead of copying?
 * https://github.com/jupyterlab/jupyter-ai/blob/main/packages/jupyter-ai/src/slash-autocompletion.tsx
 */

import { Box, Typography } from '@mui/material';
import { AutocompleteCommand } from '@jupyter/chat';

import HideSource from '@mui/icons-material/HideSource';

import React from 'react';

const DEFAULT_SLASH_COMMAND_ICONS: Record<string, JSX.Element> = {
  clear: <HideSource />
};

type SlashCommandOption = AutocompleteCommand & {
  id: string;
  description: string;
};

/**
 * Renders an option shown in the slash command autocomplete.
 */
export function renderSlashCommandOption(
  optionProps: React.HTMLAttributes<HTMLLIElement>,
  option: SlashCommandOption
): JSX.Element {
  const icon =
    option.id in DEFAULT_SLASH_COMMAND_ICONS
      ? DEFAULT_SLASH_COMMAND_ICONS[option.id]
      : DEFAULT_SLASH_COMMAND_ICONS.unknown;

  return (
    <li {...optionProps}>
      <Box sx={{ lineHeight: 0, marginRight: 4, opacity: 0.618 }}>{icon}</Box>
      <Box sx={{ flexGrow: 1 }}>
        <Typography
          component="span"
          sx={{
            fontSize: 'var(--jp-ui-font-size1)'
          }}
        >
          {option.label}
        </Typography>
        <Typography
          component="span"
          sx={{ opacity: 0.618, fontSize: 'var(--jp-ui-font-size0)' }}
        >
          {' — ' + option.description}
        </Typography>
      </Box>
    </li>
  );
}
