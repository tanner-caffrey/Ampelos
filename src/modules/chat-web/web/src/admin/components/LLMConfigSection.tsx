/**
 * LLM Configuration Section Component
 * Displays and allows editing of all LLM settings for a Letta agent
 * Using sacred computer design system
 */

import { useState, useEffect, useMemo } from 'react';
import type { LLMConfig } from '../hooks/useLLMConfig';
import Card from '../../sacred/components/Card';
import Button from '../../sacred/components/Button';
import Badge from '../../sacred/components/Badge';
import styles from './LLMConfigSection.module.scss';

interface LLMConfigSectionProps {
  config: LLMConfig | null;
  availableModels: string[];
  loading: boolean;
  error: string | null;
  onUpdateConfig: (updates: Partial<{
    model: string;
    embedding: string;
    context_window_limit: number;
    enable_sleeptime: boolean;
    system: string;
  }>) => Promise<void>;
}

export default function LLMConfigSection({
  config,
  availableModels,
  loading,
  error,
  onUpdateConfig
}: LLMConfigSectionProps) {
  const [editedSystem, setEditedSystem] = useState('');
  const [editedContextWindow, setEditedContextWindow] = useState<number>(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setEditedSystem(config.system || '');
      setEditedContextWindow(config.context_window || 0);
    }
  }, [config]);

  // Ensure the current model is always in the list of available models
  const modelOptions = useMemo(() => {
    if (!config) return availableModels;
    if (availableModels.includes(config.model)) return availableModels;
    // Current model not in list - add it at the beginning
    return [config.model, ...availableModels];
  }, [availableModels, config]);

  const handleSave = async (field: string, value: unknown) => {
    setSaving(field);
    setSaveError(null);
    try {
      await onUpdateConfig({ [field]: value });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card title="LLM Configuration">
        <div className={styles.loading}>Loading LLM configuration...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="LLM Configuration">
        <div className={styles.error}>{error}</div>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card title="LLM Configuration">
        <div className={styles.empty}>No LLM configuration available</div>
      </Card>
    );
  }

  return (
    <div className={styles.container}>
      {saveError && <div className={styles.saveError}>{saveError}</div>}

      {/* Model Selection */}
      <Card title="Model">
        <div className={styles.field}>
          <div className={styles.inputRow}>
            <select
              className={styles.select}
              value={config.model}
              onChange={(e) => handleSave('model', e.target.value)}
              disabled={saving === 'model'}
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            {saving === 'model' && <Badge>Saving...</Badge>}
          </div>
          <span className={styles.hint}>Endpoint: {config.model_endpoint_type}</span>
        </div>
      </Card>

      {/* Embedding Selection */}
      <Card title="Embedding Model">
        <div className={styles.field}>
          <div className={styles.inputRow}>
            <input
              type="text"
              className={styles.input}
              value={config.embedding}
              onChange={(e) => handleSave('embedding', e.target.value)}
              disabled={saving === 'embedding'}
            />
            {saving === 'embedding' && <Badge>Saving...</Badge>}
          </div>
          <span className={styles.hint}>
            Endpoint: {config.embedding_endpoint_type} | Dimensions: {config.embedding_dim}
          </span>
        </div>
      </Card>

      {/* Context Window */}
      <Card title="Context Window">
        <div className={styles.field}>
          <div className={styles.inputRow}>
            <input
              type="number"
              className={styles.input}
              value={editedContextWindow}
              onChange={(e) => setEditedContextWindow(parseInt(e.target.value) || 0)}
              disabled={saving === 'context_window_limit'}
            />
            <Button
              onClick={() => handleSave('context_window_limit', editedContextWindow)}
              isDisabled={saving === 'context_window_limit' || editedContextWindow === config.context_window}
            >
              {saving === 'context_window_limit' ? 'Saving...' : 'Save'}
            </Button>
          </div>
          <span className={styles.hint}>Maximum tokens in context</span>
        </div>
      </Card>

      {/* Sleeptime Toggle */}
      <Card title="Sleeptime Mode">
        <div className={styles.field}>
          <div className={styles.toggleRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={config.enable_sleeptime}
                onChange={(e) => handleSave('enable_sleeptime', e.target.checked)}
                disabled={saving === 'enable_sleeptime'}
              />
              <span className={styles.checkboxText}>
                {config.enable_sleeptime ? 'Enabled' : 'Disabled'}
              </span>
            </label>
            {saving === 'enable_sleeptime' && <Badge>Saving...</Badge>}
          </div>
          <span className={styles.hint}>Allow agent to process messages during downtime</span>
        </div>
      </Card>

      {/* System Prompt */}
      <Card title="System Prompt">
        <div className={styles.field}>
          <textarea
            className={styles.textarea}
            value={editedSystem}
            onChange={(e) => setEditedSystem(e.target.value)}
            rows={12}
            disabled={saving === 'system'}
          />
          <div className={styles.buttonRow}>
            <Button
              onClick={() => handleSave('system', editedSystem)}
              isDisabled={saving === 'system' || editedSystem === config.system}
            >
              {saving === 'system' ? 'Saving...' : 'Save System Prompt'}
            </Button>
            <Button
              theme="SECONDARY"
              onClick={() => setEditedSystem(config.system)}
              isDisabled={editedSystem === config.system}
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
