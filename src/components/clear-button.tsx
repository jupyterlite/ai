import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';

import type { TranslationBundle } from '@jupyterlab/translation';

import ClearIcon from '@mui/icons-material/Clear';

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
  /**
   * The application language translator.
   */
  translator: TranslationBundle;
}

/**
 * The clear button component.
 */
export function ClearButton(props: IClearButtonProps): JSX.Element {
  const { translator: trans } = props;
  const tooltip = trans.__('Clear chat');
  return (
    <TooltippedButton
      onClick={props.clearMessages}
      tooltip={tooltip}
      buttonProps={{
        title: tooltip,
        variant: 'outlined',
        color: 'secondary'
      }}
    >
      <ClearIcon />
    </TooltippedButton>
  );
}

/**
 * Factory returning the clear button toolbar item.
 */
export function clearItem(
  translator: TranslationBundle
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const { model } = props;
      const clearMessages = () =>
        (model.chatContext as AIChatModel.IAIChatContext).clearMessages();
      const clearProps: IClearButtonProps = {
        ...props,
        clearMessages,
        translator
      };
      return ClearButton(clearProps);
    },
    position: 0,
    hidden: false
  };
}
