/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { InputToolbarRegistry, TooltippedButton } from '@jupyter/chat';
import { checkIcon } from '@jupyterlab/ui-components';
import BuildIcon from '@mui/icons-material/Build';
import { Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';

import { ChatHandler } from '../chat-handler';
import { Tool } from '../tokens';

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
  const [selectedTools, setSelectedTools] = useState<Tool[]>([]);
  const [tools, setTools] = useState<Tool[]>(toolRegistry?.tools || []);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = useCallback((el: HTMLElement | null) => {
    setMenuAnchorEl(el);
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onClick = (tool: Tool) => {
    const currentTools = [...selectedTools];
    const index = currentTools.indexOf(tool);
    if (index !== -1) {
      currentTools.splice(index, 1);
    } else {
      currentTools.push(tool);
    }
    setSelectedTools(currentTools);
    chatContext.tools = currentTools;
  };

  useEffect(() => {
    const updateTools = () => setTools(toolRegistry?.tools || []);
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

  return useTool && tools.length ? (
    <>
      <TooltippedButton
        onClick={e => {
          openMenu(e.currentTarget);
        }}
        disabled={!tools.length}
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
          selectedTools.length === 0
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
        {tools.map(tool => (
          <Tooltip title={tool.description}>
            <MenuItem
              className={SELECT_ITEM_CLASS}
              onClick={e => {
                onClick(tool);
                // prevent sending second message with no selection
                e.stopPropagation();
              }}
            >
              {selectedTools.includes(tool) ? (
                <checkIcon.react className={'lm-Menu-itemIcon'} />
              ) : (
                <div className={'lm-Menu-itemIcon'} />
              )}
              <Typography display="block">{tool.name}</Typography>
            </MenuItem>
          </Tooltip>
        ))}
      </Menu>
    </>
  ) : (
    <></>
  );
}
