import { useEffect } from 'react';
import type { Message } from '../../types';
import { MessageItem } from './MessageItem';
import { useAutoScroll } from '../../hooks';
import BlockLoader from '../../sacred/components/BlockLoader';
import './MessageList.scss';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  loading: boolean;
  expandedToolCalls: Set<string>;
  onToggleToolCall: (id: string) => void;
  onImageClick?: (url: string) => void;
}

export function MessageList({
  messages,
  isStreaming,
  streamingMessageId,
  loading,
  expandedToolCalls,
  onToggleToolCall,
  onImageClick,
}: MessageListProps) {
  const { containerRef, isScrolledUp, scrollToBottom } = useAutoScroll([messages, isStreaming]);

  if (loading && messages.length === 0) {
    return (
      <div className="message-list-loading">
        <BlockLoader />
        <span>Loading messages...</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="message-list-empty">
        <p>No messages yet. Start a conversation!</p>
      </div>
    );
  }

  return (
    <div className="message-list-container">
      <div className="message-list" ref={containerRef}>
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={isStreaming && message.id === streamingMessageId}
            expandedToolCalls={expandedToolCalls}
            onToggleToolCall={onToggleToolCall}
            onImageClick={onImageClick}
          />
        ))}
      </div>

      {isScrolledUp && (
        <button className="scroll-to-bottom" onClick={() => scrollToBottom()}>
          ↓ New messages
        </button>
      )}
    </div>
  );
}

export default MessageList;
