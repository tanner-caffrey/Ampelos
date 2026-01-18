/**
 * Configuration form for the embodied-agent module
 */

import { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/apiFetch';
import styles from './ModuleConfigForm.module.scss';

interface EmbodiedAgentConfig {
  soma?: {
    enabled?: boolean;
    template?: string;
    model?: string;
    shared_blocks?: string[];
  };
  reflection?: {
    enabled?: boolean;
    template?: string;
    model?: string;
    interval_minutes?: number;
    shared_blocks?: string[];
  };
  body_daemon?: {
    enabled?: boolean;
    tick_interval_seconds?: number;
    idle_threshold_seconds?: number;
  };
}

interface Props {
  agentId: string;
  onClose: () => void;
}

const EmbodiedAgentConfigForm: React.FC<Props> = ({ agentId, onClose }) => {
  const [config, setConfig] = useState<EmbodiedAgentConfig>({});
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [agentId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load config and available models in parallel
      const [configResponse, modelsResponse] = await Promise.all([
        apiFetch(`/api/admin/agents/${encodeURIComponent(agentId)}/modules/embodied-agent/config`),
        apiFetch(`/api/agents/${encodeURIComponent(agentId)}/models`),
      ]);

      if (configResponse.ok) {
        const data = await configResponse.json();
        setConfig(data.data?.config || {});
      } else {
        // No config yet - use defaults
        setConfig({});
      }

      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        setAvailableModels(modelsData.models || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch(
        `/api/admin/agents/${encodeURIComponent(agentId)}/modules/embodied-agent/config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save config');
      }
      setSuccess('Configuration saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const updateSoma = (key: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      soma: { ...prev.soma, [key]: value },
    }));
  };

  const updateReflection = (key: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      reflection: { ...prev.reflection, [key]: value },
    }));
  };

  const updateBodyDaemon = (key: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      body_daemon: { ...prev.body_daemon, [key]: value },
    }));
  };

  if (loading) {
    return <div className={styles.loading}>Loading configuration...</div>;
  }

  return (
    <div className={styles.form}>
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* Soma Agent Section */}
      <div className={styles.fieldset}>
        <div className={styles.sectionTitle}>Soma Agent</div>
        <p className={styles.description}>
          Processes involuntary body responses after each chat interaction.
        </p>

        <div className={styles.fieldGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.soma?.enabled !== false}
              onChange={(e) => updateSoma('enabled', e.target.checked)}
            />
            Enable soma agent
          </label>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Template</label>
            <input
              type="text"
              value={config.soma?.template || 'soma-agent'}
              onChange={(e) => updateSoma('template', e.target.value)}
              className={styles.input}
              placeholder="soma-agent"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Model</label>
            <select
              value={config.soma?.model || ''}
              onChange={(e) => updateSoma('model', e.target.value || undefined)}
              className={styles.select}
            >
              <option value="">Use template default</option>
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reflection Agent Section */}
      <div className={styles.fieldset}>
        <div className={styles.sectionTitle}>Reflection Agent</div>
        <p className={styles.description}>
          Periodic self-reflection for memory consolidation and persona evolution.
        </p>

        <div className={styles.fieldGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.reflection?.enabled !== false}
              onChange={(e) => updateReflection('enabled', e.target.checked)}
            />
            Enable reflection agent
          </label>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Template</label>
            <input
              type="text"
              value={config.reflection?.template || 'reflection-agent'}
              onChange={(e) => updateReflection('template', e.target.value)}
              className={styles.input}
              placeholder="reflection-agent"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Model</label>
            <select
              value={config.reflection?.model || ''}
              onChange={(e) => updateReflection('model', e.target.value || undefined)}
              className={styles.select}
            >
              <option value="">Use template default</option>
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Reflection Interval (minutes)</label>
          <input
            type="number"
            value={config.reflection?.interval_minutes ?? 60}
            onChange={(e) => updateReflection('interval_minutes', parseInt(e.target.value, 10) || 60)}
            className={styles.input}
            min={1}
          />
        </div>
      </div>

      {/* Body Daemon Section */}
      <div className={styles.fieldset}>
        <div className={styles.sectionTitle}>Body Daemon</div>
        <p className={styles.description}>
          Background process for state decay and autonomous body actions. (Not yet implemented)
        </p>

        <div className={styles.fieldGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.body_daemon?.enabled === true}
              onChange={(e) => updateBodyDaemon('enabled', e.target.checked)}
            />
            Enable body daemon
          </label>
        </div>

        {config.body_daemon?.enabled && (
          <>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Tick Interval (seconds)</label>
              <input
                type="number"
                value={config.body_daemon?.tick_interval_seconds ?? 300}
                onChange={(e) => updateBodyDaemon('tick_interval_seconds', parseInt(e.target.value, 10) || 300)}
                className={styles.input}
                min={60}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Idle Threshold (seconds)</label>
              <input
                type="number"
                value={config.body_daemon?.idle_threshold_seconds ?? 3600}
                onChange={(e) => updateBodyDaemon('idle_threshold_seconds', parseInt(e.target.value, 10) || 3600)}
                className={styles.input}
                min={300}
              />
            </div>
          </>
        )}
      </div>

      <div className={styles.actions}>
        <button onClick={onClose} className={styles.cancelButton}>
          Close
        </button>
        <button onClick={saveConfig} disabled={saving} className={styles.submitButton}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};

export default EmbodiedAgentConfigForm;
