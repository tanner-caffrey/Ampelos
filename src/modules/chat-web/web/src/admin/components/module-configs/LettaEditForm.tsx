import { useState, useEffect } from 'react';
import { useMemoryBlocks } from '../../hooks/useMemoryBlocks';
import MemoryBlockEditor from '../MemoryBlockEditor';
import styles from './LettaEditForm.module.scss';

interface LettaEditFormProps {
  agentId: string;
  currentModel?: string;
  onModelChange?: (model: string) => Promise<void>;
}

const LettaEditForm: React.FC<LettaEditFormProps> = ({
  agentId,
  currentModel,
  onModelChange,
}) => {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [selectedModel, setSelectedModel] = useState(currentModel || '');
  const [savingModel, setSavingModel] = useState(false);

  const {
    blocks,
    loading: loadingBlocks,
    error: blocksError,
    createBlock,
    updateBlock,
    deleteBlock,
  } = useMemoryBlocks(agentId);

  // Load available models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/models`);
        if (response.ok) {
          const data = await response.json();
          setAvailableModels(data.models || []);
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      } finally {
        setLoadingModels(false);
      }
    };
    loadModels();
  }, [agentId]);

  // Update selected model when currentModel changes
  useEffect(() => {
    if (currentModel) {
      setSelectedModel(currentModel);
    }
  }, [currentModel]);

  const handleModelSave = async () => {
    if (!selectedModel || selectedModel === currentModel || !onModelChange) return;

    setSavingModel(true);
    try {
      await onModelChange(selectedModel);
    } catch (err) {
      console.error('Failed to update model:', err);
      alert(err instanceof Error ? err.message : 'Failed to update model');
      setSelectedModel(currentModel || '');
    } finally {
      setSavingModel(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Model Selection */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Model</h4>
        <div className={styles.field}>
          <span className={styles.label}>LLM Model</span>
          {loadingModels ? (
            <span className={styles.value}>Loading models...</span>
          ) : (
            <>
              <select
                className={styles.select}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={savingModel}
              >
                <option value="">Select a model...</option>
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              {onModelChange && selectedModel !== currentModel && (
                <button
                  className={styles.saveButton}
                  onClick={handleModelSave}
                  disabled={savingModel || !selectedModel}
                >
                  {savingModel ? 'Saving...' : 'Save'}
                </button>
              )}
            </>
          )}
        </div>
        <p className={styles.initOnlyNote}>
          Note: Embedding model and system prompt template are set at creation time and cannot be changed.
        </p>
      </div>

      {/* Memory Blocks */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Memory</h4>
        <MemoryBlockEditor
          blocks={blocks}
          loading={loadingBlocks}
          error={blocksError}
          onCreateBlock={createBlock}
          onUpdateBlock={updateBlock}
          onDeleteBlock={deleteBlock}
        />
      </div>
    </div>
  );
};

export default LettaEditForm;
