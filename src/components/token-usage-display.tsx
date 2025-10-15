import { ReactWidget, UseSignal } from '@jupyterlab/ui-components';
import React from 'react';
import { ISignal } from '@lumino/signaling';
import { AISettingsModel } from '../models/settings-model';
import { ITokenUsage } from '../tokens';

/**
 * Props for the TokenUsageDisplay component.
 */
export interface ITokenUsageDisplayProps {
  /**
   * The token usage changed signal
   */
  tokenUsageChanged: ISignal<any, ITokenUsage>;

  /**
   * The settings model instance for configuration options
   */
  settingsModel: AISettingsModel;

  /**
   * Initial token usage.
   */
  initialTokenUsage?: ITokenUsage;
}

/**
 * React component that displays token usage information.
 * Shows input/output token counts with up/down arrows.
 * Only renders when token usage display is enabled in settings.
 */
export const TokenUsageDisplay: React.FC<ITokenUsageDisplayProps> = ({
  tokenUsageChanged,
  settingsModel,
  initialTokenUsage
}) => {
  return (
    <UseSignal signal={settingsModel.stateChanged} initialArgs={undefined}>
      {() => {
        const config = settingsModel.config;
        if (!config.showTokenUsage) {
          return null;
        }

        return (
          <UseSignal signal={tokenUsageChanged} initialArgs={initialTokenUsage}>
            {(_, tokenUsage: ITokenUsage | null | undefined) => {
              if (!tokenUsage) {
                return null;
              }

              const total = tokenUsage.inputTokens + tokenUsage.outputTokens;
              if (total === 0) {
                return null;
              }

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: 'var(--jp-ui-font-color2)',
                    padding: '4px 8px',
                    backgroundColor: 'var(--jp-layout-color1)',
                    border: '1px solid var(--jp-border-color1)',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap'
                  }}
                  title={`Token Usage - Sent: ${tokenUsage.inputTokens.toLocaleString()}, Received: ${tokenUsage.outputTokens.toLocaleString()}, Total: ${total.toLocaleString()}`}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    <span>↑</span>
                    <span>{tokenUsage.inputTokens.toLocaleString()}</span>
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    <span>↓</span>
                    <span>{tokenUsage.outputTokens.toLocaleString()}</span>
                  </span>
                </div>
              );
            }}
          </UseSignal>
        );
      }}
    </UseSignal>
  );
};

/**
 * JupyterLab widget wrapper for the TokenUsageDisplay component.
 * Extends ReactWidget to integrate with the JupyterLab widget system.
 */
export class TokenUsageWidget extends ReactWidget {
  /**
   * Creates a new TokenUsageWidget instance.
   * @param options - Configuration options containing required models
   */
  constructor(options: ITokenUsageDisplayProps) {
    super();
    this._options = options;
  }

  /**
   * Renders the React component within the widget.
   * @returns The TokenUsageDisplay React element
   */
  protected render(): React.ReactElement {
    return <TokenUsageDisplay {...this._options} />;
  }

  private _options: ITokenUsageDisplayProps;
}
