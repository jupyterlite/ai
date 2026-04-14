import { ReactWidget, UseSignal } from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import React from 'react';
import { ISignal } from '@lumino/signaling';
import type { IAISettingsModel, ITokenUsage } from '../tokens';

/**
 * Props for the UsageDisplay component.
 */
export interface IUsageDisplayProps {
  /**
   * The token usage changed signal
   */
  tokenUsageChanged: ISignal<any, ITokenUsage>;

  /**
   * The settings model instance for configuration options
   */
  settingsModel: IAISettingsModel;

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
 * React component that displays usage information.
 * Shows input/output token counts and optional estimated context usage.
 * Only renders when token or context usage display is enabled in settings.
 */
export const UsageDisplay: React.FC<IUsageDisplayProps> = ({
  tokenUsageChanged,
  settingsModel,
  initialTokenUsage,
  translator: trans
}) => {
  const formatContextPercent = (value: number): string => {
    return Math.round(value).toLocaleString();
  };

  const badgeStyle: React.CSSProperties = {
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
  };

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
              const hasKnownContextWindow =
                showContextUsage && tokenUsage.contextWindow !== undefined;
              const contextUsagePercent =
                tokenUsage.lastRequestInputTokens !== undefined &&
                tokenUsage.contextWindow !== undefined &&
                tokenUsage.contextWindow > 0
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        (tokenUsage.lastRequestInputTokens /
                          tokenUsage.contextWindow) *
                          100
                      )
                    )
                  : undefined;
              const hasContextEstimate =
                hasKnownContextWindow &&
                contextUsagePercent !== undefined &&
                tokenUsage.lastRequestInputTokens !== undefined;

              const contextLabel = hasContextEstimate
                ? `${formatContextPercent(contextUsagePercent)}%`
                : hasKnownContextWindow
                  ? '0%'
                  : '?';

              const contextTitle = hasContextEstimate
                ? trans.__(
                    'Context Usage (estimated): %1% (%2 / %3 tokens)',
                    formatContextPercent(contextUsagePercent),
                    tokenUsage.lastRequestInputTokens!.toLocaleString(),
                    tokenUsage.contextWindow!.toLocaleString()
                  )
                : hasKnownContextWindow
                  ? trans.__(
                      'Context usage estimate will appear after the next request. Showing 0% until then. Context window: %1 tokens',
                      tokenUsage.contextWindow!.toLocaleString()
                    )
                  : trans.__(
                      'Context Usage unavailable. Configure a context window for the active provider/model to enable estimation.'
                    );

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {showTokenUsage && (
                    <span
                      style={badgeStyle}
                      title={trans.__(
                        'Token Usage - Sent: %1, Received: %2, Total: %3',
                        tokenUsage.inputTokens.toLocaleString(),
                        tokenUsage.outputTokens.toLocaleString(),
                        total.toLocaleString()
                      )}
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
                    </span>
                  )}
                  {showContextUsage && (
                    <span style={badgeStyle} title={contextTitle}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                      >
                        <span>ctx</span>
                        <span>{contextLabel}</span>
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
 * JupyterLab widget wrapper for the UsageDisplay component.
 * Extends ReactWidget to integrate with the JupyterLab widget system.
 */
export class UsageWidget extends ReactWidget {
  /**
   * Creates a new UsageWidget instance.
   * @param options - Configuration options containing required models
   */
  constructor(options: IUsageDisplayProps) {
    super();
    this._options = options;
  }

  /**
   * Renders the React component within the widget.
   * @returns The UsageDisplay React element
   */
  protected render(): React.ReactElement {
    return <UsageDisplay {...this._options} />;
  }

  private _options: IUsageDisplayProps;
}
