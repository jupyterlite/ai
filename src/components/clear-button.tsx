/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import BackspaceIcon from '@mui/icons-material/Backspace';
import React from 'react';

import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';

/**
 * Properties of the clear button.
 */
export interface IClearButtonProps
  extends InputToolbarRegistry.IToolbarItemProps {
  /**
   * The function to clear the chat.
   */
  clearChat: () => void;
}

/**
 * The clear button component.
 */
export function ClearButton(props: IClearButtonProps): JSX.Element {
  const tooltip = 'Clear chat';

  return (
    <TooltippedButton
      onClick={props.clearChat}
      tooltip={tooltip}
      buttonProps={{
        size: 'small',
        variant: 'contained',
        title: tooltip
      }}
    >
      <BackspaceIcon />
    </TooltippedButton>
  );
}

/**
 * Factory function returning the toolbar item.
 */
export function clearItem(
  clearChat: () => void
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const clearProps: IClearButtonProps = { ...props, clearChat };
      return <ClearButton {...clearProps} />;
    },
    position: 60
  };
}
