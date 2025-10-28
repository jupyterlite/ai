import { InputToolbarRegistry } from '@jupyter/chat';

import StopIcon from '@mui/icons-material/Stop';

import { Button } from '@mui/material';

import React from 'react';

import { AIChatModel } from '../chat-model';

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
    <Button
      onClick={props.stopStreaming}
      aria-label={tooltip}
      size={'small'}
      variant={'contained'}
      color={'error'}
      title={tooltip}
    >
      <StopIcon />
    </Button>
  );
}

/**
 * Factory returning the stop button toolbar item.
 */
export function stopItem(): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const { model } = props;
      const stopStreaming = () =>
        (model.chatContext as AIChatModel.IAIChatContext).stopStreaming();
      const stopProps: IStopButtonProps = { ...props, stopStreaming };
      return StopButton(stopProps);
    },
    position: 50,
    hidden: true // Hidden by default, shown when streaming
  };
}
