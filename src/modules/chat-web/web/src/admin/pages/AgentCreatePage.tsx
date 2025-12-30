import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAgentTemplates } from '../hooks/useTemplates';
import * as api from '../api/adminClient';
import styles from './AgentCreatePage.module.scss';

type CreateMode = 'manual' | 'template';

const AgentCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { templates } = useAgentTemplates();

  const [mode, setMode] = useState<CreateMode>('manual');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual mode state
  const [agentId, setAgentId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Template mode state
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);

  const handleManualCreate = async () => {
    if (!agentId || !agentName) {
      setError('Agent ID and Name are required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      await api.createAgent({
        id: agentId,
        name: agentName,
        enabled,
      });

      navigate(`/admin/agents/${agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  const handleTemplateCreate = async () => {
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    if (!templateVariables.agent_id || !templateVariables.agent_name) {
      setError('Agent ID and Name are required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const result = await api.createAgentFromTemplate(selectedTemplate, templateVariables);
      navigate(`/admin/agents/${result.agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setTemplateVariables({ agent_id: '', agent_name: '' });
  };

  return (
    <div className={styles.page}>
      <Link to="/admin/agents" className={styles.backLink}>
        &larr; Back to Agents
      </Link>

      <h1 className={styles.title}>Create Agent</h1>

      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeButton} ${mode === 'manual' ? styles.active : ''}`}
          onClick={() => setMode('manual')}
        >
          Manual
        </button>
        <button
          className={`${styles.modeButton} ${mode === 'template' ? styles.active : ''}`}
          onClick={() => setMode('template')}
        >
          From Template
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {mode === 'manual' ? (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Agent ID *</label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agent-example"
              className={styles.input}
            />
            <span className={styles.hint}>Unique identifier, cannot be changed later</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Agent Name *</label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Example Agent"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enabled
            </label>
          </div>

          <button
            onClick={handleManualCreate}
            disabled={creating || !agentId || !agentName}
            className={styles.createButton}
          >
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      ) : (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className={styles.select}
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTemplateObj && (
              <span className={styles.hint}>{selectedTemplateObj.description}</span>
            )}
          </div>

          {selectedTemplateObj && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Agent ID *</label>
                <input
                  type="text"
                  value={templateVariables.agent_id || ''}
                  onChange={(e) =>
                    setTemplateVariables((prev) => ({ ...prev, agent_id: e.target.value }))
                  }
                  placeholder="agent-example"
                  className={styles.input}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Agent Name *</label>
                <input
                  type="text"
                  value={templateVariables.agent_name || ''}
                  onChange={(e) =>
                    setTemplateVariables((prev) => ({ ...prev, agent_name: e.target.value }))
                  }
                  placeholder="Example Agent"
                  className={styles.input}
                />
              </div>

              {selectedTemplateObj.variables
                .filter((v) => v.name !== 'agent_id' && v.name !== 'agent_name')
                .map((variable) => (
                  <div key={variable.name} className={styles.field}>
                    <label className={styles.label}>
                      {variable.name} {variable.required && '*'}
                    </label>
                    {variable.type === 'select' && variable.options ? (
                      <select
                        value={templateVariables[variable.name] || variable.default || ''}
                        onChange={(e) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [variable.name]: e.target.value,
                          }))
                        }
                        className={styles.select}
                      >
                        {variable.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={templateVariables[variable.name] || variable.default || ''}
                        onChange={(e) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [variable.name]: e.target.value,
                          }))
                        }
                        placeholder={String(variable.default || '')}
                        className={styles.input}
                      />
                    )}
                    {variable.description && (
                      <span className={styles.hint}>{variable.description}</span>
                    )}
                  </div>
                ))}
            </>
          )}

          <button
            onClick={handleTemplateCreate}
            disabled={creating || !selectedTemplate}
            className={styles.createButton}
          >
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AgentCreatePage;
