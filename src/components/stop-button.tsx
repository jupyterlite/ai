/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import StopIcon from '@mui/icons-material/Stop';
import React from 'react';

import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';

/**
 * Properties of the stop button.
 */
export interface IStopButtonProps
  extends InputToolbarRegistry.IToolbarItemProps {
  /**
   * The function to stop streaming.
   */
  stopStreaming: () => void;
}

/**
 * The stop button.
 */
export function StopButton(props: IStopButtonProps): JSX.Element {
  const tooltip = 'Stop streaming';
  return (
    <TooltippedButton
      onClick={props.stopStreaming}
      tooltip={tooltip}
      buttonProps={{
        size: 'small',
        variant: 'contained',
        title: tooltip
      }}
    >
      <StopIcon />
    </TooltippedButton>
  );
}

/**
 * factory returning the toolbar item.
 */
export function stopItem(
  stopStreaming: () => void
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const stopProps: IStopButtonProps = { ...props, stopStreaming };
      return StopButton(stopProps);
    },
    position: 50,
    hidden: true /* hidden by default */
  };
}
