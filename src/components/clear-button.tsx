import { InputToolbarRegistry } from '@jupyter/chat';

import ClearIcon from '@mui/icons-material/Clear';

import { Button } from '@mui/material';

import React from 'react';

import { AIChatModel } from '../chat-model';

/**
 * Properties of the clear button.
 */
export interface IClearButtonProps
  extends InputToolbarRegistry.IToolbarItemProps {
  /**
   * The function to clear messages.
   */
  clearMessages: () => void;
}

/**
 * The clear button component.
 */
export function ClearButton(props: IClearButtonProps): JSX.Element {
  const tooltip = 'Clear chat';
  return (
    <Button
      onClick={props.clearMessages}
      aria-label={tooltip}
      size={'small'}
      variant={'outlined'}
      color={'secondary'}
      title={tooltip}
    >
      <ClearIcon />
    </Button>
  );
}

/**
 * Factory returning the clear button toolbar item.
 */
export function clearItem(): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const { model } = props;
      const clearMessages = () =>
        (model.chatContext as AIChatModel.IAIChatContext).clearMessages();
      const clearProps: IClearButtonProps = { ...props, clearMessages };
      return ClearButton(clearProps);
    },
    position: 0,
    hidden: false
  };
}
