import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';

import type { TranslationBundle } from '@jupyterlab/translation';

import BuildIcon from '@mui/icons-material/Build';

import CheckIcon from '@mui/icons-material/Check';

import { Divider, Menu, MenuItem, Tooltip, Typography } from '@mui/material';

import React, { useCallback, useEffect, useState } from 'react';

import { INamedTool, IToolRegistry } from '../tokens';
import { AIChatModel } from '../chat-model';
import { AISettingsModel } from '../models/settings-model';
import { createProviderTools } from '../providers/provider-tools';

const SELECT_ITEM_CLASS = 'jp-AIToolSelect-item';

/**
 * Properties for the tool select component.
 */
export interface IToolSelectProps
  extends InputToolbarRegistry.IToolbarItemProps {
  /**
   * The tool registry to get available tools from.
   */
  toolRegistry: IToolRegistry;

  /**
   * Whether tools are enabled.
   */
  toolsEnabled: boolean;

  /**
   * Function to handle tool selection changes.
   */
  onToolSelectionChange: (selectedToolNames: string[]) => void;

  /**
   * The settings model to compute provider-level web tools.
   */
  settingsModel: AISettingsModel;

  /**
   * The application language translator.
   */
  translator: TranslationBundle;
}

/**
 * The tool select component for choosing AI tools.
 */
export function ToolSelect(props: IToolSelectProps): JSX.Element {
  const {
    toolRegistry,
    onToolSelectionChange,
    toolsEnabled,
    settingsModel,
    model,
    translator: trans
  } = props;
  const chatContext = model.chatContext as AIChatModel.IAIChatContext;
  const agentManager = chatContext.agentManager;

  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);
  const [tools, setTools] = useState<INamedTool[]>(
    toolRegistry?.namedTools || []
  );
  const [providerToolNames, setProviderToolNames] = useState<string[]>([]);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = useCallback((el: HTMLElement | null) => {
    setMenuAnchorEl(el);
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const toggleTool = useCallback(
    (toolName: string) => {
      const currentToolNames = [...selectedToolNames];
      const index = currentToolNames.indexOf(toolName);

      if (index !== -1) {
        // Remove tool
        currentToolNames.splice(index, 1);
      } else {
        // Add tool
        currentToolNames.push(toolName);
      }

      setSelectedToolNames(currentToolNames);
      onToolSelectionChange(currentToolNames);
    },
    [selectedToolNames, onToolSelectionChange]
  );

  // Update tools when registry changes
  useEffect(() => {
    const updateTools = () => {
      const newTools = toolRegistry?.namedTools || [];
      setTools(newTools);
    };

    if (toolRegistry) {
      updateTools();
      toolRegistry.toolsChanged.connect(updateTools);
      return () => {
        toolRegistry.toolsChanged.disconnect(updateTools);
      };
    }
  }, [toolRegistry]);

  // Track provider-level tools (e.g. web_search/web_fetch).
  useEffect(() => {
    if (!agentManager || !toolsEnabled) {
      setProviderToolNames([]);
      return;
    }

    const updateProviderTools = () => {
      const activeProviderId = agentManager.activeProvider;
      const providerConfig = settingsModel.getProvider(activeProviderId);
      if (!providerConfig) {
        setProviderToolNames([]);
        return;
      }

      const providerTools = createProviderTools({
        provider: providerConfig.provider,
        customSettings: providerConfig.customSettings,
        hasFunctionTools: selectedToolNames.length > 0
      });
      setProviderToolNames(Object.keys(providerTools));
    };

    updateProviderTools();
    settingsModel.stateChanged.connect(updateProviderTools);
    agentManager.activeProviderChanged.connect(updateProviderTools);

    return () => {
      settingsModel.stateChanged.disconnect(updateProviderTools);
      agentManager.activeProviderChanged.disconnect(updateProviderTools);
    };
  }, [settingsModel, agentManager, selectedToolNames.length, toolsEnabled]);

  // Initialize selected tools to all tools by default
  useEffect(() => {
    if (tools.length > 0 && selectedToolNames.length === 0) {
      const defaultToolNames = tools.map(tool => tool.name);
      setSelectedToolNames(defaultToolNames);
      onToolSelectionChange(defaultToolNames);
    }
  }, [tools, selectedToolNames.length, onToolSelectionChange]);

  // Don't render if tools are disabled or no tools available
  if (!toolsEnabled || (tools.length === 0 && providerToolNames.length === 0)) {
    return <></>;
  }

  const selectedCount = selectedToolNames.length + providerToolNames.length;
  const totalCount = tools.length + providerToolNames.length;

  return (
    <>
      <TooltippedButton
        onClick={e => {
          openMenu(e.currentTarget);
        }}
        tooltip={trans.__(
          'Tools (%1/%2 selected)',
          selectedCount.toString(),
          totalCount.toString()
        )}
        buttonProps={{
          ...(selectedCount === 0 && {
            variant: 'outlined'
          }),
          title: trans.__('Select AI Tools'),
          onKeyDown: e => {
            if (e.key !== 'Enter' && e.key !== ' ') {
              return;
            }
            openMenu(e.currentTarget);
            // Stop propagation to prevent sending message
            e.stopPropagation();
          }
        }}
        sx={
          selectedCount === 0
            ? { backgroundColor: 'var(--jp-layout-color3)' }
            : {}
        }
      >
        <BuildIcon sx={{ fontSize: 'small' }} />
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
          '& .MuiMenuItem-root': {
            padding: '0.5em',
            paddingRight: '2em'
          }
        }}
      >
        {tools.map(namedTool => (
          <Tooltip
            key={namedTool.name}
            title={namedTool.tool.description || namedTool.name}
            placement="left"
          >
            <MenuItem
              className={SELECT_ITEM_CLASS}
              onClick={e => {
                toggleTool(namedTool.name);
                // Prevent sending message on tool selection
                e.stopPropagation();
              }}
            >
              {selectedToolNames.includes(namedTool.name) ? (
                <CheckIcon
                  sx={{
                    marginRight: '8px',
                    color: 'var(--jp-brand-color1, #2196F3)'
                  }}
                />
              ) : (
                <div style={{ width: '24px', marginRight: '8px' }} />
              )}
              <Typography variant="body2">{namedTool.name}</Typography>
            </MenuItem>
          </Tooltip>
        ))}

        {providerToolNames.length > 0 && tools.length > 0 && <Divider />}

        {providerToolNames.length > 0 && (
          <MenuItem disabled>
            <Typography variant="caption">
              {trans.__('Provider Tools')}
            </Typography>
          </MenuItem>
        )}

        {providerToolNames.map(toolName => {
          return (
            <Tooltip
              key={toolName}
              title={trans.__('Enabled via provider settings.')}
              placement="left"
            >
              <MenuItem className={SELECT_ITEM_CLASS} disabled>
                <CheckIcon
                  sx={{
                    marginRight: '8px',
                    color: 'var(--jp-brand-color1, #2196F3)'
                  }}
                />
                <Typography variant="body2">{toolName}</Typography>
              </MenuItem>
            </Tooltip>
          );
        })}
      </Menu>
    </>
  );
}

/**
 * Factory function returning the toolbar item for tool selection.
 */
export function createToolSelectItem(
  toolRegistry: IToolRegistry,
  settingsModel: AISettingsModel,
  toolsEnabled: boolean = true,
  translator: TranslationBundle
): InputToolbarRegistry.IToolbarItem {
  return {
    element: (props: InputToolbarRegistry.IToolbarItemProps) => {
      const onToolSelectionChange = (tools: string[]) => {
        const chatContext = props.model
          .chatContext as AIChatModel.IAIChatContext;
        if (!chatContext.agentManager) {
          return;
        }
        chatContext.agentManager.setSelectedTools(tools);
      };

      const toolSelectProps: IToolSelectProps = {
        ...props,
        toolRegistry,
        settingsModel,
        onToolSelectionChange,
        toolsEnabled,
        translator
      };
      return <ToolSelect {...toolSelectProps} />;
    },
    position: 1
  };
}
