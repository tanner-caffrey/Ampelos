import type { MemoryBlock } from '../../types';
import type { DiffParts } from '../../utils/formatting';
import Badge from '../../sacred/components/Badge';
import BarProgress from '../../sacred/components/BarProgress';
import BlockLoader from '../../sacred/components/BlockLoader';
import './MemorySidebar.scss';

interface MemorySidebarProps {
  memoryBlocks: MemoryBlock[];
  loading: boolean;
  expandedBlocks: Set<string>;
  flashingBlocks: Set<string>;
  getDiff: (block: MemoryBlock) => DiffParts | null;
  onToggleBlock: (id: string) => void;
  onRefresh: () => void;
}

export function MemorySidebar({
  memoryBlocks,
  loading,
  expandedBlocks,
  flashingBlocks,
  getDiff,
  onToggleBlock,
  onRefresh,
}: MemorySidebarProps) {
  if (loading && memoryBlocks.length === 0) {
    return (
      <div className="memory-sidebar-loading">
        <BlockLoader />
      </div>
    );
  }

  if (memoryBlocks.length === 0) {
    return (
      <div className="memory-sidebar-empty">
        <p>No memory blocks</p>
      </div>
    );
  }

  const getUsageColor = (usage: number): string => {
    if (usage >= 0.9) return 'var(--theme-error)';
    if (usage >= 0.75) return 'var(--theme-warning)';
    return 'var(--theme-success)';
  };

  return (
    <div className="memory-sidebar">
      <div className="memory-sidebar-header">
        <span>Memory Blocks</span>
        <button className="refresh-button" onClick={onRefresh} title="Refresh">
          ↻
        </button>
      </div>

      <div className="memory-blocks">
        {memoryBlocks.map((block) => {
          const usage = block.value.length / block.limit;
          const isExpanded = expandedBlocks.has(block.id);
          const isFlashing = flashingBlocks.has(block.id);
          const diff = getDiff(block);

          return (
            <div
              key={block.id}
              className={`memory-block ${isFlashing ? 'flashing' : ''} ${isExpanded ? 'expanded' : ''}`}
            >
              <div className="memory-block-header" onClick={() => onToggleBlock(block.id)}>
                <div className="memory-block-title">
                  <span className="memory-block-label">{block.label}</span>
                  {isFlashing && (
                    <Badge style={{ backgroundColor: 'var(--theme-success)', fontSize: '0.5rem' }}>
                      updated
                    </Badge>
                  )}
                </div>
                <span className="memory-block-toggle">{isExpanded ? '▼' : '▶'}</span>
              </div>

              <div className="memory-block-progress">
                <BarProgress progress={Math.min(usage * 100, 100)} />
                <span
                  className="memory-block-usage"
                  style={{ color: getUsageColor(usage) }}
                >
                  {block.value.length} / {block.limit}
                </span>
              </div>

              {isExpanded && (
                <div className="memory-block-content">
                  {diff ? (
                    <pre className="memory-block-text diff">
                      <span className="diff-unchanged">{diff.prefix}</span>
                      <span className="diff-changed">{diff.changed}</span>
                      <span className="diff-unchanged">{diff.suffix}</span>
                    </pre>
                  ) : (
                    <pre className="memory-block-text">{block.value}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MemorySidebar;
