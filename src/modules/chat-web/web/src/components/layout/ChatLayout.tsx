import { ReactNode } from 'react';
import { useSidebarResize } from '../../hooks';
import './ChatLayout.scss';

interface ChatLayoutProps {
  leftSidebar: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
  header?: ReactNode;
}

export function ChatLayout({ leftSidebar, rightSidebar, children, header }: ChatLayoutProps) {
  const leftResize = useSidebarResize({
    defaultWidth: 280,
    minWidth: 200,
    maxWidth: 400,
    storageKey: 'chat-left-sidebar-width',
  });

  const rightResize = useSidebarResize({
    defaultWidth: 300,
    minWidth: 200,
    maxWidth: 500,
    storageKey: 'chat-right-sidebar-width',
  });

  return (
    <div className="chat-layout">
      {/* Left Sidebar */}
      <div
        className={`chat-sidebar chat-sidebar-left ${leftResize.isCollapsed ? 'collapsed' : ''}`}
        style={{ width: leftResize.isCollapsed ? 0 : leftResize.width }}
      >
        <div className="sidebar-content">{leftSidebar}</div>
        {!leftResize.isCollapsed && (
          <div
            className={`resize-handle ${leftResize.isDragging ? 'dragging' : ''}`}
            onMouseDown={leftResize.handleMouseDown}
          />
        )}
      </div>

      {/* Toggle for collapsed left sidebar */}
      {leftResize.isCollapsed && (
        <button className="sidebar-toggle left" onClick={leftResize.toggleCollapse}>
          ▶
        </button>
      )}

      {/* Main Content */}
      <div className="chat-main">
        {header && <div className="chat-header">{header}</div>}
        <div className="chat-content">{children}</div>

        {/* Collapse button for left */}
        {!leftResize.isCollapsed && (
          <button
            className="collapse-button left"
            onClick={leftResize.toggleCollapse}
            title="Collapse sidebar"
          >
            ◀
          </button>
        )}

        {/* Collapse button for right */}
        {rightSidebar && !rightResize.isCollapsed && (
          <button
            className="collapse-button right"
            onClick={rightResize.toggleCollapse}
            title="Collapse memory"
          >
            ▶
          </button>
        )}
      </div>

      {/* Right Sidebar */}
      {rightSidebar && (
        <>
          {rightResize.isCollapsed && (
            <button className="sidebar-toggle right" onClick={rightResize.toggleCollapse}>
              ◀
            </button>
          )}
          <div
            className={`chat-sidebar chat-sidebar-right ${rightResize.isCollapsed ? 'collapsed' : ''}`}
            style={{ width: rightResize.isCollapsed ? 0 : rightResize.width }}
          >
            {!rightResize.isCollapsed && (
              <div
                className={`resize-handle left ${rightResize.isDragging ? 'dragging' : ''}`}
                onMouseDown={rightResize.handleMouseDown}
              />
            )}
            <div className="sidebar-content">{rightSidebar}</div>
          </div>
        </>
      )}
    </div>
  );
}

export default ChatLayout;
