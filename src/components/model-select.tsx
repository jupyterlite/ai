import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';
import CheckIcon from '@mui/icons-material/Check';
import { Menu, MenuItem, Typography } from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { AIChatModel } from '../chat-model';
import { AISettingsModel } from '../models/settings-model';

const SELECT_ITEM_CLASS = 'labai-model-select-item';

/**
 * Properties for the model select component.
 */
export interface IModelSelectProps
  extends InputToolbarRegistry.IToolbarItemProps {
  /**
   * The settings model to get available models and current selection from.
   */
  settingsModel: AISettingsModel;
}

/**
 * The model select component for choosing AI models.
 */
export function ModelSelect(props: IModelSelectProps): JSX.Element {
  const { settingsModel, model } = props;
  const agentManager = (model.chatContext as AIChatModel.IAIChatContext)
    .agentManager;

  const [currentProvider, setCurrentProvider] = useState<string>(
    agentManager.activeProvider ?? ''
  );
  const [currentModel, setCurrentModel] = useState<string>('');
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Get configured providers from settings model
  const configuredProviders = settingsModel.providers;

  const openMenu = useCallback((el: HTMLElement | null) => {
    setMenuAnchorEl(el);
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const selectModel = useCallback(
    async (providerId: string) => {
      // Set the active provider using the provider ID
      agentManager.activeProvider = providerId;
      closeMenu();

      // Provider selected successfully
    },
    [settingsModel, closeMenu]
  );

  // Update current selection when settings model changes
  useEffect(() => {
    const updateCurrentSelection = () => {
      if (!agentManager.activeProvider) {
        return;
      }
      const activeProviderConfig = settingsModel.getProvider(
        agentManager.activeProvider
      );
      if (activeProviderConfig) {
        setCurrentProvider(activeProviderConfig.id);
        setCurrentModel(activeProviderConfig.model);
      }
    };

    updateCurrentSelection();
    agentManager.activeProviderChanged.connect(updateCurrentSelection);
    return () => {
      agentManager.activeProviderChanged.disconnect(updateCurrentSelection);
    };
  }, [settingsModel]);

  // Get current provider label for display
  const activeProviderConfig = settingsModel.getProvider(currentProvider);
  const currentProviderLabel = activeProviderConfig?.name || currentProvider;

  // Use all configured providers (they're already validated when added)
  const availableProviders = configuredProviders;

  // Get available model combinations from configured providers
  const availableModels = availableProviders.map(provider => ({
    provider: provider.id,
    providerLabel: provider.name,
    model: provider.model,
    isSelected:
      provider.id === currentProvider && provider.model === currentModel
  }));

  // Show a message if no providers are configured
  if (availableModels.length === 0) {
    return (
      <TooltippedButton
        onClick={() => {}}
        tooltip="No providers configured. Please go to AI Settings to add a provider."
        buttonProps={{
          size: 'small',
          variant: 'outlined',
          color: 'warning',
          disabled: true,
          title: 'No Providers Available'
        }}
        sx={{
          minWidth: 'auto',
          display: 'flex',
          alignItems: 'center',
          height: '29px'
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontSize: '0.7rem', fontWeight: 500 }}
        >
          No Providers
        </Typography>
      </TooltippedButton>
    );
  }

  return (
    <>
      <TooltippedButton
        onClick={e => {
          openMenu(e.currentTarget);
        }}
        tooltip={`Current Model: ${currentProviderLabel} - ${currentModel}`}
        buttonProps={{
          size: 'small',
          variant: 'contained',
          color: 'primary',
          title: 'Select AI Model',
          onKeyDown: e => {
            if (e.key !== 'Enter' && e.key !== ' ') {
              return;
            }
            openMenu(e.currentTarget);
            // Stop propagation to prevent sending message
            e.stopPropagation();
          }
        }}
        sx={{
          minWidth: 'auto',
          display: 'flex',
          alignItems: 'center',
          height: '29px'
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontSize: '0.7rem', fontWeight: 500, textTransform: 'none' }}
        >
          {currentProviderLabel}
        </Typography>
      </TooltippedButton>

      <Menu
        open={menuOpen}
        onClose={closeMenu}
        anchorEl={menuAnchorEl}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right'
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'right'
        }}
        sx={{
          '& .MuiPaper-root': {
            maxHeight: '300px',
            overflowY: 'auto'
          },
          '& .MuiMenuItem-root': {
            padding: '0.5em',
            paddingRight: '2em',
            minWidth: '200px'
          }
        }}
      >
        {availableModels.map(({ provider, providerLabel, isSelected }) => (
          <MenuItem
            key={provider}
            className={SELECT_ITEM_CLASS}
            onClick={async e => {
              await selectModel(provider);
              // Prevent sending message on model selection
              e.stopPropagation();
            }}
            sx={{
              backgroundColor: isSelected
                ? 'var(--jp-brand-color3, rgba(33, 150, 243, 0.1))'
                : 'transparent',
              '&:hover': {
                backgroundColor: isSelected
                  ? 'var(--jp-brand-color3, rgba(33, 150, 243, 0.15))'
                  : 'var(--jp-layout-color1)'
              },
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isSelected ? (
              <CheckIcon
                sx={{
                  color: 'var(--jp-brand-color1, #2196F3)',
                  fontSize: 16
                }}
              />
            ) : (
              <div style={{ width: '16px' }} />
            )}
            <Typography
              variant="body2"
              component="div"
              sx={{
                fontWeight: isSelected ? 600 : 400,
                color: isSelected
                  ? 'var(--jp-brand-color1, #2196F3)'
                  : 'inherit'
              }}
            >
              {providerLabel}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * Factory function returning the toolbar item for model selection.
 */
export function createModelSelectItem(
  settingsModel: AISettingsModel
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const chatContext = props.model.chatContext as AIChatModel.IAIChatContext;
      if (!chatContext.agentManager) {
        return;
      }
      const modelSelectProps: IModelSelectProps = {
        ...props,
        settingsModel
      };
      return <ModelSelect {...modelSelectProps} />;
    },
    position: 0.5
  };
}
