import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';

import StopIcon from '@mui/icons-material/Stop';

import React from 'react';

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
 * The stop button component.
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
        color: 'error',
        title: tooltip
      }}
    >
      <StopIcon />
    </TooltippedButton>
  );
}

/**
 * Factory returning the stop button toolbar item.
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
    hidden: true // Hidden by default, shown when streaming
  };
}
