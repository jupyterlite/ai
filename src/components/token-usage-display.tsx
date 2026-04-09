import { ReactWidget, UseSignal } from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import React from 'react';
import { ISignal } from '@lumino/signaling';
import type { IAISettingsModel, ITokenUsage } from '../tokens';

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
  const formatContextPercent = (value: number): string => {
    const maximumFractionDigits = value >= 10 ? 1 : 2;
    return value.toLocaleString(undefined, {
      maximumFractionDigits
    });
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
              const hasTokenUsage = showTokenUsage && total > 0;
              const hasKnownContextWindow =
                showContextUsage && tokenUsage.contextWindow !== undefined;
              const hasContextEstimate =
                hasKnownContextWindow &&
                tokenUsage.contextUsagePercent !== undefined &&
                tokenUsage.lastRequestInputTokens !== undefined;
              const shouldShowContextBadge = showContextUsage;

              if (!hasTokenUsage && !shouldShowContextBadge) {
                return null;
              }

              const contextLabel = hasContextEstimate
                ? `${formatContextPercent(tokenUsage.contextUsagePercent!)}%`
                : hasKnownContextWindow
                  ? '0%'
                  : '?';

              const contextTitle = hasContextEstimate
                ? trans.__(
                    'Context Usage (estimated): %1% (%2 / %3 tokens)',
                    formatContextPercent(tokenUsage.contextUsagePercent!),
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
                  {hasTokenUsage && (
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
                  {shouldShowContextBadge && (
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
