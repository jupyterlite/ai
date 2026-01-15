import { InputToolbarRegistry, TooltippedIconButton } from '@jupyter/chat';

import type { TranslationBundle } from '@jupyterlab/translation';

import StopIcon from '@mui/icons-material/Stop';

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
  /**
   * The application language translator.
   */
  translator: TranslationBundle;
}

/**
 * The stop button component.
 */
export function StopButton(props: IStopButtonProps): JSX.Element {
  const { translator: trans } = props;
  const tooltip = trans.__('Stop streaming');
  return (
    <TooltippedIconButton
      onClick={props.stopStreaming}
      tooltip={tooltip}
      buttonProps={{
        title: tooltip
      }}
      sx={{
        backgroundColor: 'var(--mui-palette-error-main, #d32f2f);'
      }}
    >
      <StopIcon />
    </TooltippedIconButton>
  );
}

/**
 * Factory returning the stop button toolbar item.
 */
export function stopItem(
  translator: TranslationBundle
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const { model } = props;
      const stopStreaming = () =>
        (model.chatContext as AIChatModel.IAIChatContext).stopStreaming();
      const stopProps: IStopButtonProps = {
        ...props,
        stopStreaming,
        translator
      };
      return StopButton(stopProps);
    },
    position: 50,
    hidden: true // Hidden by default, shown when streaming
  };
}
