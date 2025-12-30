import { useState } from 'react';
import type { MemoryBlockDetail, CreateMemoryBlockRequest } from '../types/admin';
import styles from './MemoryBlockEditor.module.scss';

interface MemoryBlockEditorProps {
  blocks: MemoryBlockDetail[];
  loading: boolean;
  error: string | null;
  onCreateBlock: (data: CreateMemoryBlockRequest) => Promise<string>;
  onUpdateBlock: (blockLabel: string, value: string) => Promise<void>;
  onDeleteBlock: (blockId: string) => Promise<void>;
}

const MemoryBlockEditor: React.FC<MemoryBlockEditorProps> = ({
  blocks,
  loading,
  error,
  onCreateBlock,
  onUpdateBlock,
  onDeleteBlock,
}) => {
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBlockLabel, setNewBlockLabel] = useState('');
  const [newBlockValue, setNewBlockValue] = useState('');
  const [newBlockLimit, setNewBlockLimit] = useState('5000');
  const [blockEdits, setBlockEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const handleToggleExpand = (blockId: string) => {
    if (expandedBlock === blockId) {
      setExpandedBlock(null);
    } else {
      setExpandedBlock(blockId);
      // Initialize edit value if not present
      const block = blocks.find((b) => b.id === blockId);
      if (block && blockEdits[blockId] === undefined) {
        setBlockEdits((prev) => ({ ...prev, [blockId]: block.value }));
      }
    }
  };

  const handleAddBlock = async () => {
    if (!newBlockLabel.trim()) return;

    setSaving('new');
    try {
      await onCreateBlock({
        label: newBlockLabel.trim(),
        value: newBlockValue,
        limit: parseInt(newBlockLimit, 10) || 5000,
      });
      setShowAddForm(false);
      setNewBlockLabel('');
      setNewBlockValue('');
      setNewBlockLimit('5000');
    } catch (err) {
      console.error('Failed to create block:', err);
      alert(err instanceof Error ? err.message : 'Failed to create block');
    } finally {
      setSaving(null);
    }
  };

  const handleUpdateBlock = async (block: MemoryBlockDetail) => {
    const newValue = blockEdits[block.id];
    if (newValue === undefined || newValue === block.value) return;

    setSaving(block.id);
    try {
      await onUpdateBlock(block.label, newValue);
    } catch (err) {
      console.error('Failed to update block:', err);
      alert(err instanceof Error ? err.message : 'Failed to update block');
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteBlock = async (block: MemoryBlockDetail) => {
    if (!confirm(`Delete memory block "${block.label}"? This cannot be undone.`)) return;

    setSaving(block.id);
    try {
      await onDeleteBlock(block.id);
      setExpandedBlock(null);
    } catch (err) {
      console.error('Failed to delete block:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete block');
    } finally {
      setSaving(null);
    }
  };

  const getCharCountClass = (block: MemoryBlockDetail, currentValue: string) => {
    const ratio = currentValue.length / block.limit;
    if (ratio >= 1) return styles.charCountError;
    if (ratio >= 0.9) return styles.charCountWarning;
    return styles.charCount;
  };

  if (loading) {
    return <div className={styles.loading}>Loading memory blocks...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Memory Blocks ({blocks.length})</span>
        <button
          className={styles.addButton}
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
        >
          + Add Block
        </button>
      </div>

      {showAddForm && (
        <div className={styles.addForm}>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Label</label>
              <input
                type="text"
                className={styles.formInput}
                value={newBlockLabel}
                onChange={(e) => setNewBlockLabel(e.target.value)}
                placeholder="e.g., persona, goals, context"
              />
            </div>
            <div className={styles.formFieldSmall}>
              <label className={styles.formLabel}>Limit</label>
              <input
                type="number"
                className={styles.formInput}
                value={newBlockLimit}
                onChange={(e) => setNewBlockLimit(e.target.value)}
                min="100"
                max="50000"
              />
            </div>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Value</label>
            <textarea
              className={styles.formTextarea}
              value={newBlockValue}
              onChange={(e) => setNewBlockValue(e.target.value)}
              placeholder="Memory block content..."
            />
          </div>
          <div className={styles.formActions}>
            <button
              className={styles.cancelButton}
              onClick={() => {
                setShowAddForm(false);
                setNewBlockLabel('');
                setNewBlockValue('');
                setNewBlockLimit('5000');
              }}
            >
              Cancel
            </button>
            <button
              className={styles.saveButton}
              onClick={handleAddBlock}
              disabled={!newBlockLabel.trim() || saving === 'new'}
            >
              {saving === 'new' ? 'Creating...' : 'Create Block'}
            </button>
          </div>
        </div>
      )}

      {blocks.length === 0 ? (
        <div className={styles.empty}>No memory blocks configured</div>
      ) : (
        <div className={styles.blockList}>
          {blocks.map((block) => {
            const currentValue = blockEdits[block.id] ?? block.value;
            const hasChanges = currentValue !== block.value;

            return (
              <div key={block.id} className={styles.block}>
                <div
                  className={styles.blockHeader}
                  onClick={() => handleToggleExpand(block.id)}
                >
                  <span className={styles.blockLabel}>{block.label}</span>
                  <div className={styles.blockMeta}>
                    <span className={getCharCountClass(block, currentValue)}>
                      {currentValue.length}/{block.limit}
                    </span>
                    <span className={styles.expandIcon}>
                      {expandedBlock === block.id ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {expandedBlock === block.id && (
                  <div className={styles.blockBody}>
                    <textarea
                      className={styles.blockTextarea}
                      value={currentValue}
                      onChange={(e) =>
                        setBlockEdits((prev) => ({
                          ...prev,
                          [block.id]: e.target.value,
                        }))
                      }
                    />
                    <div className={styles.blockActions}>
                      <div className={styles.blockActionsLeft}>
                        <button
                          className={styles.updateButton}
                          onClick={() => handleUpdateBlock(block)}
                          disabled={!hasChanges || saving === block.id}
                        >
                          {saving === block.id ? 'Saving...' : 'Save Changes'}
                        </button>
                        {hasChanges && (
                          <button
                            className={styles.cancelButton}
                            onClick={() =>
                              setBlockEdits((prev) => ({
                                ...prev,
                                [block.id]: block.value,
                              }))
                            }
                          >
                            Revert
                          </button>
                        )}
                      </div>
                      <button
                        className={styles.deleteButton}
                        onClick={() => handleDeleteBlock(block)}
                        disabled={saving === block.id}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MemoryBlockEditor;
