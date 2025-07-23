import AddIcon from '@mui/icons-material/Add';
import React from 'react';

import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';

/**
 * Props for the New Chat button.
 */
export interface INewChatButtonProps
  extends InputToolbarRegistry.IToolbarItemProps {
  newChat: () => void;
}

/**
 * The new chat button component.
 */
export function NewChatButton(props: INewChatButtonProps): JSX.Element {
  const tooltip = 'Start a new chat';
  return (
    <TooltippedButton
      onClick={props.newChat}
      tooltip={tooltip}
      sx={{
        color: 'var(--jp-ui-font-color1)',
        textTransform: 'none',
        fontWeight: 'normal',
        padding: '2px 4px',
        fontSize: '0.75rem',
        '&:hover': {
          backgroundColor: 'var(--jp-layout-color2)'
        }
      }}
      buttonProps={{
        size: 'small',
        variant: 'text',
        title: tooltip
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1px',
          fontSize: '1rem'
        }}
      >
        <AddIcon fontSize="small" sx={{ color: 'var(--jp-ui-font-color2)' }} />
        Chat
      </span>
    </TooltippedButton>
  );
}

/**
 * Factory to create the toolbar item for new chat.
 */
export function newChatItem(
  newChat: () => void
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const newProps: INewChatButtonProps = { ...props, newChat };
      return NewChatButton(newProps);
    },
    position: 2000,
    hidden: false
  };
}
