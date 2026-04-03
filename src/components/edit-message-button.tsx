import type { MessageFooterSection, MessageFooterSectionProps } from '@jupyter/chat'

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { Box, IconButton, Typography } from '@mui/material'

import React, { useRef } from 'react'

import type { AIChatModel } from '../chat-model'

/**
 * A footer section that shows branch navigation arrows on user messages
 * that have been edited. The edit UI itself is provided natively by
 * @jupyter/chat via model.updateMessage.
 */
function BranchNavigation({
  model,
  message
}: MessageFooterSectionProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null)
  const aiModel = model as AIChatModel
  const branchInfo = aiModel.getBranchInfo?.(message.id) ?? null

  if (!branchInfo) {
    return null
  }

  const handleSwitch = (direction: 'prev' | 'next') => {
    // Preserve scroll position — @jupyter/chat scrolls to bottom on messagesUpdated
    let scrollEl: HTMLElement | null = containerRef.current
    while (scrollEl) {
      const oy = getComputedStyle(scrollEl).overflowY
      if (oy === 'auto' || oy === 'scroll') break
      scrollEl = scrollEl.parentElement
    }
    const savedTop = scrollEl?.scrollTop
    aiModel.switchBranch(message.id, direction)
    setTimeout(() => {
      if (scrollEl && savedTop !== undefined) scrollEl.scrollTop = savedTop
    }, 0)
  }

  return (
    <Box
      ref={containerRef}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
    >
      <IconButton
        size="small"
        disabled={branchInfo.current <= 1}
        onClick={() => handleSwitch('prev')}
        title="Previous branch"
      >
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <Typography variant="caption" sx={{ userSelect: 'none' }}>
        {branchInfo.current}/{branchInfo.total}
      </Typography>
      <IconButton
        size="small"
        disabled={branchInfo.current >= branchInfo.total}
        onClick={() => handleSwitch('next')}
        title="Next branch"
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}

/**
 * Returns the message footer section descriptor for branch navigation.
 */
export function createEditMessageSection(): MessageFooterSection {
  return {
    component: BranchNavigation,
    position: 'right'
  }
}
