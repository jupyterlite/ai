import React, { useEffect, useRef } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { buildChatSidebar, IChatModel } from '@jupyter/chat';
import { NewChatButton } from './new-chat-button';
import { jupyternautLiteIcon } from '../icons';

export function buildSidebarWithHeader(
  options: Parameters<typeof buildChatSidebar>[0],
  newChat: () => void,
  model: IChatModel
): ReactWidget {
  const sidebar = buildChatSidebar(options);

  const ChatSidebarWithHeader = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(sidebar.node);
        sidebar.node.style.flex = '1';
        sidebar.node.style.height = '100%';
        sidebar.update();
      }
    }, []);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '8px',
            borderBottom: '1px solid var(--jp-border-color2)'
          }}
        >
          <NewChatButton newChat={newChat} model={model.input} />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }} ref={containerRef}></div>
      </div>
    );
  };

  const widget = ReactWidget.create(<ChatSidebarWithHeader />);
  widget.title.icon = jupyternautLiteIcon;
  return widget;
}
