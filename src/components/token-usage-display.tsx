import { ReactWidget, UseSignal } from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
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

  /**
   * The application language translator.
   */
  translator: TranslationBundle;
}

/**
 * React component that displays token usage information.
 * Shows input/output token counts and optional estimated context usage.
 * Only renders when token or context usage display is enabled in settings.
 */
export const TokenUsageDisplay: React.FC<ITokenUsageDisplayProps> = ({
  tokenUsageChanged,
  settingsModel,
  initialTokenUsage,
  translator: trans
}) => {
  return (
    <UseSignal signal={settingsModel.stateChanged} initialArgs={undefined}>
      {() => {
        const config = settingsModel.config;
        const showTokenUsage = config.showTokenUsage;
        const showContextUsage = config.showContextUsage;
        if (!showTokenUsage && !showContextUsage) {
          return null;
        }

        return (
          <UseSignal signal={tokenUsageChanged} initialArgs={initialTokenUsage}>
            {(_, tokenUsage: ITokenUsage | null | undefined) => {
              if (!tokenUsage) {
                return null;
              }

              const total = tokenUsage.inputTokens + tokenUsage.outputTokens;
              const hasTokenUsage = showTokenUsage && total > 0;
              const hasContextUsage =
                showContextUsage &&
                tokenUsage.contextUsagePercent !== undefined &&
                tokenUsage.contextWindow !== undefined &&
                tokenUsage.lastRequestInputTokens !== undefined;

              if (!hasTokenUsage && !hasContextUsage) {
                return null;
              }

              const contextTitle = hasContextUsage
                ? trans.__(
                    'Context Usage (estimated): %1% (%2 / %3 tokens)',
                    tokenUsage.contextUsagePercent!.toLocaleString(undefined, {
                      maximumFractionDigits: 1
                    }),
                    tokenUsage.lastRequestInputTokens!.toLocaleString(),
                    tokenUsage.contextWindow!.toLocaleString()
                  )
                : '';

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
                  title={trans.__(
                    '%1%2',
                    hasTokenUsage
                      ? trans.__(
                          'Token Usage - Sent: %1, Received: %2, Total: %3',
                          tokenUsage.inputTokens.toLocaleString(),
                          tokenUsage.outputTokens.toLocaleString(),
                          total.toLocaleString()
                        )
                      : '',
                    hasTokenUsage && hasContextUsage
                      ? `\n${contextTitle}`
                      : contextTitle
                  )}
                >
                  {hasTokenUsage && (
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
                  )}
                  {hasTokenUsage && (
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
                  )}
                  {hasContextUsage && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                    >
                      <span>ctx</span>
                      <span>
                        {tokenUsage.contextUsagePercent!.toLocaleString(
                          undefined,
                          {
                            maximumFractionDigits: 1
                          }
                        )}
                        %
                      </span>
                    </span>
                  )}
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
