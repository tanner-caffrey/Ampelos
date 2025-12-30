import { useState } from 'react';
import type { ToolCall } from '../../types';
import { parseToolArguments, formatJson } from '../../utils/formatting';
import Badge from '../../sacred/components/Badge';
import './ToolCallDisplay.scss';

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ToolCallDisplay({ toolCall, isExpanded, onToggle }: ToolCallDisplayProps) {
  const [showArgs, setShowArgs] = useState(true);

  const args = parseToolArguments(toolCall.arguments);
  const result = parseToolArguments(toolCall.result);

  const statusColor = toolCall.status === 'error' ? 'var(--theme-error)' :
    toolCall.status === 'executing' ? 'var(--theme-warning)' :
    'var(--theme-success)';

  return (
    <div className="tool-call-display">
      <div className="tool-call-header" onClick={onToggle}>
        <div className="tool-call-info">
          <span className="tool-call-icon">
            {toolCall.status === 'executing' ? '⟳' : toolCall.status === 'error' ? '✕' : '✓'}
          </span>
          <span className="tool-call-name">{toolCall.name}</span>
          {toolCall.duration !== undefined && (
            <span className="tool-call-duration">{toolCall.duration}ms</span>
          )}
        </div>
        <Badge style={{ backgroundColor: statusColor }}>
          {toolCall.status || 'unknown'}
        </Badge>
      </div>

      {isExpanded && (
        <div className="tool-call-content">
          <div className="tool-call-tabs">
            <button
              className={`tool-call-tab ${showArgs ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setShowArgs(true); }}
            >
              Arguments
            </button>
            <button
              className={`tool-call-tab ${!showArgs ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setShowArgs(false); }}
            >
              Result
            </button>
          </div>
          <pre className="tool-call-code">
            {showArgs
              ? (args ? formatJson(args) : 'No arguments')
              : (result ? formatJson(result) : 'No result yet')}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ToolCallDisplay;
