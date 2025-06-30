/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';
import { checkIcon } from '@jupyterlab/ui-components';
import BuildIcon from '@mui/icons-material/Build';
import { Menu, MenuItem, Typography } from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';

import { ChatHandler } from '../chat-handler';

const SELECT_ITEM_CLASS = 'jp-AIToolSelect-item';

/**
 * The tool select component.
 */
export function toolSelect(
  props: InputToolbarRegistry.IToolbarItemProps
): JSX.Element {
  const chatContext = props.model.chatContext as ChatHandler.ChatContext;
  const toolRegistry = chatContext.toolsRegistry;

  const [useTool, setUseTool] = useState<boolean>(chatContext.useTool);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [toolNames, setToolNames] = useState<string[]>(
    toolRegistry?.toolNames || []
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

  const onClick = useCallback(
    (tool: string | null) => {
      setSelectedTool(tool);
      chatContext.tool = toolRegistry?.get(tool) || null;
    },
    [props.model]
  );

  useEffect(() => {
    const updateTools = () => setToolNames(toolRegistry?.toolNames || []);
    toolRegistry?.toolsChanged.connect(updateTools);
    return () => {
      toolRegistry?.toolsChanged.disconnect(updateTools);
    };
  }, [toolRegistry]);

  useEffect(() => {
    const updateUseTool = (_: ChatHandler, value: boolean) => setUseTool(value);
    chatContext.useToolChanged.connect(updateUseTool);
    return () => {
      chatContext.useToolChanged.disconnect(updateUseTool);
    };
  }, [chatContext]);

  return useTool && toolNames.length ? (
    <>
      <TooltippedButton
        onClick={e => {
          openMenu(e.currentTarget);
        }}
        disabled={!toolNames.length}
        tooltip="Tool"
        buttonProps={{
          variant: 'contained',
          onKeyDown: e => {
            if (e.key !== 'Enter' && e.key !== ' ') {
              return;
            }
            openMenu(e.currentTarget);
            // stopping propagation of this event prevents the prompt from being
            // sent when the dropdown button is selected and clicked via 'Enter'.
            e.stopPropagation();
          }
        }}
        sx={
          selectedTool === null
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
            gap: '4px',
            padding: '6px'
          }
        }}
      >
        <MenuItem
          className={SELECT_ITEM_CLASS}
          onClick={e => {
            onClick(null);
            // prevent sending second message with no selection
            e.stopPropagation();
          }}
        >
          {selectedTool === null ? (
            <checkIcon.react className={'lm-Menu-itemIcon'} />
          ) : (
            <div className={'lm-Menu-itemIcon'} />
          )}
          <Typography display="block">No tool</Typography>
        </MenuItem>
        {toolNames.map(tool => (
          <MenuItem
            className={SELECT_ITEM_CLASS}
            onClick={e => {
              onClick(tool);
              // prevent sending second message with no selection
              e.stopPropagation();
            }}
          >
            {selectedTool === tool ? (
              <checkIcon.react className={'lm-Menu-itemIcon'} />
            ) : (
              <div className={'lm-Menu-itemIcon'} />
            )}
            <Typography display="block">{tool}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  ) : (
    <></>
  );
}
