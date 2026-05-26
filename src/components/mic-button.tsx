import { InputToolbarRegistry, TooltippedIconButton, IAttachment } from '@jupyter/chat';
import { TranslationBundle } from '@jupyterlab/translation';
import MicIcon from '@mui/icons-material/Mic';
import { MicRecorder } from 'jupyter-chat-components';
import React, { useState, useEffect, useRef } from 'react';
import { modelSupportsAudio } from '../providers/model-info';
import type { IAISettingsModel, IProviderRegistry } from '../tokens';
import { AIChatModel } from '../chat-model';

/**
 * Properties for the mic button component.
 */
export interface IMicButtonProps
  extends InputToolbarRegistry.IToolbarItemProps {
  settingsModel: IAISettingsModel;
  providerRegistry: IProviderRegistry;
  translator: TranslationBundle;
}

/**
 * The mic button component for hybrid voice messages and transcription dictation.
 */
export function MicButton(props: IMicButtonProps): JSX.Element {
  const { settingsModel, providerRegistry, translator: trans } = props;
  const chatContext = props.model.chatContext as AIChatModel.IAIChatContext;
  const agentManager = chatContext?.agentManager;

  const [mode, setMode] = useState<'voice' | 'dictation'>('dictation');
  const [isRecording, setIsRecording] = useState(false);
  const initialValueRef = useRef('');

  const updateMode = () => {
    if (!agentManager) {
      return;
    }
    const activeProviderId = agentManager.activeProvider;
    const providerConfig = settingsModel.getProvider(activeProviderId);
    const supportsAudio = modelSupportsAudio(providerConfig, providerRegistry);
    setMode(supportsAudio ? 'voice' : 'dictation');
  };

  useEffect(() => {
    updateMode();
    if (agentManager) {
      agentManager.activeProviderChanged.connect(updateMode);
    }
    settingsModel.stateChanged.connect(updateMode);
    return () => {
      if (agentManager) {
        agentManager.activeProviderChanged.disconnect(updateMode);
      }
      settingsModel.stateChanged.disconnect(updateMode);
    };
  }, [settingsModel, agentManager]);

  const handleStartRecording = () => {
    initialValueRef.current = props.model.value || '';
    setIsRecording(true);
  };

  const handleCancel = () => {
    setIsRecording(false);
    if (mode === 'dictation' && props.model) {
      props.model.value = initialValueRef.current;
    }
  };

  const handleTranscription = (text: string) => {
    const inputModel = props.model;
    if (inputModel) {
      const prefix = initialValueRef.current ? initialValueRef.current + ' ' : '';
      inputModel.value = prefix + text;
    }
  };

  const handleAudioRecorded = async (blob: Blob) => {
    setIsRecording(false);

    try {
      // Convert recorded Blob to Base64 Data URI
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        try {
          const base64data = reader.result as string;

          // Attach the Base64 Data URI directly in the input toolbar model
          const inputModel = props.model;
          if (inputModel) {
            const attachment: IAttachment = {
              type: 'file',
              value: base64data,
              mimetype: 'audio/wav'
            };

            if (typeof inputModel.addAttachment === 'function') {
              inputModel.addAttachment(attachment);
            } else if (Array.isArray(inputModel.attachments)) {
              (inputModel as any).attachments = [...inputModel.attachments, attachment];
              if (typeof (inputModel as any).stateChanged?.emit === 'function') {
                (inputModel as any).stateChanged.emit();
              }
            }
          }
        } catch (err) {
          console.error('Failed to attach voice message:', err);
        }
      };
    } catch (error) {
      console.error('Failed to save audio recording:', error);
      alert(trans.__('Failed to save audio recording: ') + error);
    }
  };

  const tooltip = mode === 'voice'
    ? trans.__('Record Voice Message')
    : trans.__('Dictate text');

  if (isRecording) {
    return (
      <div
        className="jp-ai-glassmorphic-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1000,
          backgroundColor: 'var(--jp-layout-color1)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          boxSizing: 'border-box',
          borderRadius: '4px'
        }}
      >
        <MicRecorder
          mode={mode}
          onTranscription={handleTranscription}
          onAudioRecorded={handleAudioRecorded}
          onCancel={handleCancel}
          onDone={() => setIsRecording(false)}
          trans={trans}
        />
      </div>
    );
  }

  return (
    <TooltippedIconButton
      onClick={handleStartRecording}
      tooltip={tooltip}
      buttonProps={{
        title: tooltip
      }}
    >
      <MicIcon />
    </TooltippedIconButton>
  );
}

/**
 * Factory function returning the toolbar item for the mic recorder button.
 */
export function micItem(
  translator: TranslationBundle,
  settingsModel: IAISettingsModel,
  providerRegistry: IProviderRegistry
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const micProps: IMicButtonProps = {
        ...props,
        settingsModel,
        providerRegistry,
        translator
      };
      return <MicButton {...micProps} />;
    },
    position: 45 // Position it neatly near the stop/send actions
  };
}
