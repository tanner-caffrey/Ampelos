import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message, MessageContent } from '../../types';
import { formatTimestamp } from '../../utils/formatting';
import { ToolCallDisplay } from './ToolCallDisplay';
import Badge from '../../sacred/components/Badge';
import './MessageItem.scss';

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  expandedToolCalls: Set<string>;
  onToggleToolCall: (id: string) => void;
  onImageClick?: (url: string) => void;
}

/**
 * Check if a message is a scheduled message (prefixed with [SCHEDULED])
 */
function isScheduledMessage(content: string | MessageContent[]): boolean {
  if (typeof content === 'string') {
    return content.startsWith('[SCHEDULED]');
  }
  // Check first text item in multi-modal content
  const textItem = content.find((item) => item.type === 'text' && item.text);
  return textItem?.text?.startsWith('[SCHEDULED]') || false;
}

/**
 * Extract the message content without the [SCHEDULED] prefix
 */
function getScheduledMessageContent(content: string | MessageContent[]): string {
  if (typeof content === 'string') {
    return content.replace(/^\[SCHEDULED\]\s*/, '');
  }
  const textItem = content.find((item) => item.type === 'text' && item.text);
  return textItem?.text?.replace(/^\[SCHEDULED\]\s*/, '') || '';
}

export function MessageItem({
  message,
  isStreaming,
  expandedToolCalls,
  onToggleToolCall,
  onImageClick,
}: MessageItemProps) {
  const [isScheduledExpanded, setIsScheduledExpanded] = useState(false);

  const roleColors: Record<string, string> = {
    user: 'var(--theme-primary)',
    assistant: 'var(--theme-accent)',
    system: 'var(--theme-warning)',
    tool: 'var(--theme-info)',
    scheduled: 'var(--theme-secondary)',
  };

  // Check if this is a scheduled message
  const scheduled = message.content && isScheduledMessage(message.content);

  const renderContent = () => {
    const content = message.content;

    // String content
    if (typeof content === 'string') {
      return (
        <div className="message-text">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      );
    }

    // Multi-modal content
    return (
      <div className="message-multimodal">
        {content.map((item: MessageContent, idx: number) => {
          if (item.type === 'text' && item.text) {
            return (
              <div key={idx} className="message-text">
                <ReactMarkdown>{item.text}</ReactMarkdown>
              </div>
            );
          }
          if (item.type === 'image') {
            const src = item.imageUrl || (item.imageData ? `data:${item.imageMimeType || 'image/jpeg'};base64,${item.imageData}` : null);
            if (src) {
              return (
                <img
                  key={idx}
                  src={src}
                  alt="Attached image"
                  className="message-image"
                  onClick={() => onImageClick?.(src)}
                />
              );
            }
          }
          return null;
        })}
      </div>
    );
  };

  // Scheduled messages (displayed minimized/collapsible)
  if (scheduled) {
    const scheduledContent = getScheduledMessageContent(message.content);
    return (
      <div className={`message-item message-scheduled ${isStreaming ? 'streaming' : ''}`}>
        <div
          className="scheduled-header"
          onClick={() => setIsScheduledExpanded(!isScheduledExpanded)}
        >
          <span className="scheduled-icon">⏰</span>
          <span className="scheduled-label">Scheduled Message</span>
          <Badge style={{ backgroundColor: roleColors[message.role] || roleColors.system }}>
            {message.role}
          </Badge>
          <span className="message-time">{formatTimestamp(message.created_at)}</span>
          <span className="expand-toggle">{isScheduledExpanded ? '▼' : '▶'}</span>
        </div>
        {isScheduledExpanded && (
          <div className="scheduled-content">
            <ReactMarkdown>{scheduledContent}</ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  // Tool-only messages
  if (message.role === 'tool' || (message.role === 'assistant' && message.tool_calls?.length && !message.content)) {
    return (
      <div className={`message-item message-tool ${isStreaming ? 'streaming' : ''}`}>
        <div className="message-header">
          <Badge style={{ backgroundColor: roleColors.tool }}>tool</Badge>
          <span className="message-time">{formatTimestamp(message.created_at)}</span>
        </div>
        <div className="message-tool-calls">
          {message.tool_calls?.map((tc) => (
            <ToolCallDisplay
              key={tc.id}
              toolCall={tc}
              isExpanded={expandedToolCalls.has(tc.id)}
              onToggle={() => onToggleToolCall(tc.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`message-item message-${message.role} ${isStreaming ? 'streaming' : ''}`}>
      <div className="message-header">
        <Badge style={{ backgroundColor: roleColors[message.role] || roleColors.assistant }}>
          {message.agent_name || message.role}
        </Badge>
        <span className="message-time">{formatTimestamp(message.created_at)}</span>
      </div>

      <div className="message-body">
        {renderContent()}
        {isStreaming && <span className="streaming-cursor">▌</span>}
      </div>

      {message.tool_calls && message.tool_calls.length > 0 && (
        <div className="message-tool-calls">
          {message.tool_calls.map((tc) => (
            <ToolCallDisplay
              key={tc.id}
              toolCall={tc}
              isExpanded={expandedToolCalls.has(tc.id)}
              onToggle={() => onToggleToolCall(tc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default MessageItem;
