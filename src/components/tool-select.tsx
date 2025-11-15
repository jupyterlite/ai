import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';

import BuildIcon from '@mui/icons-material/Build';

import CheckIcon from '@mui/icons-material/Check';

import { Menu, MenuItem, Tooltip, Typography } from '@mui/material';

import React, { useCallback, useEffect, useState } from 'react';

import { INamedTool, IToolRegistry } from '../tokens';
import { AIChatModel } from '../chat-model';

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
}

/**
 * The tool select component for choosing AI tools.
 */
export function ToolSelect(props: IToolSelectProps): JSX.Element {
  const { toolRegistry, onToolSelectionChange, toolsEnabled } = props;

  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);
  const [tools, setTools] = useState<INamedTool[]>(
    toolRegistry?.namedTools || []
  );
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

  // Initialize selected tools to all tools by default
  useEffect(() => {
    if (tools.length > 0 && selectedToolNames.length === 0) {
      const defaultToolNames = tools.map(tool => tool.name);
      setSelectedToolNames(defaultToolNames);
      onToolSelectionChange(defaultToolNames);
    }
  }, [tools, selectedToolNames.length, onToolSelectionChange]);

  // Don't render if tools are disabled or no tools available
  if (!toolsEnabled || tools.length === 0) {
    return <></>;
  }

  return (
    <>
      <TooltippedButton
        onClick={e => {
          openMenu(e.currentTarget);
        }}
        tooltip={`Tools (${selectedToolNames.length}/${tools.length} selected)`}
        buttonProps={{
          size: 'small',
          variant: selectedToolNames.length > 0 ? 'contained' : 'outlined',
          color: 'primary',
          title: 'Select AI Tools',
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
          selectedToolNames.length === 0
            ? { backgroundColor: 'var(--jp-layout-color3)' }
            : {}
        }
      >
        <BuildIcon />
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
      </Menu>
    </>
  );
}

/**
 * Factory function returning the toolbar item for tool selection.
 */
export function createToolSelectItem(
  toolRegistry: IToolRegistry,
  toolsEnabled: boolean = true
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
        onToolSelectionChange,
        toolsEnabled
      };
      return <ToolSelect {...toolSelectProps} />;
    },
    position: 1
  };
}
