import { useState, useEffect } from 'react';
import { Agent } from '../App';
import { apiFetch } from '../utils/apiFetch';
import './MemoryBlocks.css';

interface MemoryBlock {
  id: string;
  label: string;
  value: string;
  limit: number;
  template_name?: string;
}

interface MemoryBlocksProps {
  agent: Agent;
}

function MemoryBlocks({ agent }: MemoryBlocksProps) {
  const [blocks, setBlocks] = useState<MemoryBlock[]>([]);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMemoryBlocks();

    // Refresh memory blocks every 10 seconds
    const interval = setInterval(loadMemoryBlocks, 10000);
    return () => clearInterval(interval);
  }, [agent.agent_id]);

  const loadMemoryBlocks = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/agents/${encodeURIComponent(agent.agent_id)}/memory`);
      if (!response.ok) {
        throw new Error(`Failed to load memory: ${response.statusText}`);
      }
      const data = await response.json();
      setBlocks(data.blocks || []);

      // Auto-expand all blocks on first load
      if (expandedBlocks.size === 0 && data.blocks?.length > 0) {
        setExpandedBlocks(new Set(data.blocks.map((b: MemoryBlock) => b.id)));
      }
    } catch (err) {
      console.error('Failed to load memory blocks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load memory');
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = (blockId: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const getCharCount = (text: string) => {
    return text.length;
  };

  return (
    <div className="memory-blocks">
      <div className="memory-header">
        <h3>Core Memory</h3>
        {loading && <div className="spinner-small"></div>}
      </div>

      {error && (
        <div className="memory-error">
          <span className="error-icon">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {blocks.length === 0 && !loading && !error && (
        <div className="empty-memory">
          <p>No memory blocks</p>
        </div>
      )}

      <div className="blocks-list">
        {blocks.map((block) => {
          const isExpanded = expandedBlocks.has(block.id);
          const charCount = getCharCount(block.value);
          const charLimit = block.limit;
          const percentage = charLimit > 0 ? (charCount / charLimit) * 100 : 0;

          return (
            <div key={block.id} className="memory-block">
              <button
                className="block-header"
                onClick={() => toggleBlock(block.id)}
              >
                <div className="block-title">
                  <span className="block-label">{block.label}</span>
                  {block.template_name && (
                    <span className="block-template">{block.template_name}</span>
                  )}
                </div>
                <div className="block-meta">
                  <span className="block-stats">
                    {charCount} / {charLimit}
                  </span>
                  <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                    ▼
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="block-content">
                  <div className="block-progress">
                    <div
                      className="block-progress-bar"
                      style={{
                        width: `${Math.min(percentage, 100)}%`,
                        backgroundColor:
                          percentage > 90
                            ? 'var(--error)'
                            : percentage > 70
                            ? 'var(--warning)'
                            : 'var(--accent-primary)'
                      }}
                    />
                  </div>
                  <div className="block-value">
                    {block.value || <span className="empty-value">No content</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MemoryBlocks;
