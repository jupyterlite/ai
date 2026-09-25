import StopIcon from '@mui/icons-material/Stop';
import { InputToolbarRegistry, TooltippedIconButton } from '@jupyter/chat';
import React, { useEffect, useState } from 'react';

import { IPersona } from '../tokens';

const STOP_BUTTON_CLASS = 'jp-jai-stop-button';

/**
 * Stop button for the Jupyternaut persona. Enables itself while the persona
 * is busy and calls `agentManager.stopStreaming()` on click. Visibility is
 * controlled externally by the `stopButtonPlugin`.
 */
export function JupyternautStopButton(
  props: InputToolbarRegistry.IToolbarItemProps & {
    persona: IPersona;
  }
): JSX.Element {
  const { persona } = props;
  const [busy, setBusy] = useState(persona.isBusy);
  const tooltip = 'Stop generating';

  useEffect(() => {
    setBusy(persona.isBusy);
    const onBusyChanged = (_: unknown, value: boolean) => setBusy(value);
    persona.busyChanged.connect(onBusyChanged);
    return () => {
      persona.busyChanged.disconnect(onBusyChanged);
    };
  }, [persona]);

  return (
    <TooltippedIconButton
      onClick={() => persona.agentManager.stopStreaming()}
      tooltip={tooltip}
      disabled={!busy}
      buttonProps={{ title: tooltip, className: STOP_BUTTON_CLASS }}
      aria-label={tooltip}
    >
      <StopIcon />
    </TooltippedIconButton>
  );
}
