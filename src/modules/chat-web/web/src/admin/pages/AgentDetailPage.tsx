import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../../utils/apiFetch';
import { useAgent } from '../hooks/useAgents';
import { useAvailableModules } from '../hooks/useModules';
import { useMemoryBlocks } from '../hooks/useMemoryBlocks';
import { useLLMConfig } from '../hooks/useLLMConfig';
import { useAgentTools } from '../hooks/useAgentTools';
import StatusBadge from '../components/StatusBadge';
import JsonStateEditor from '../components/module-configs/JsonStateEditor';
import BlueskyConfigForm, { type BlueskyConfig } from '../components/module-configs/BlueskyConfigForm';
import SpatialStateEditor from '../components/module-configs/SpatialStateEditor';
import EmbodimentStateEditor from '../components/module-configs/EmbodimentStateEditor';
import MemoryBlockEditor from '../components/MemoryBlockEditor';
import LLMConfigSection from '../components/LLMConfigSection';
import ToolManager from '../components/ToolManager';
import styles from './AgentDetailPage.module.scss';

// Modules that require configuration before being added
const MODULES_REQUIRING_CONFIG = ['bluesky'];

const AgentDetailPage: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { agent, state, loading, error, updateAgent, toggleEnabled, addModule, removeModule, refetch } =
    useAgent(agentId);
  const { modules: availableModules } = useAvailableModules();

  // Memory blocks and LLM config - Letta is core infrastructure, available for all enabled agents
  const hasLetta = agent?.enabled ?? false;
  const {
    blocks: memoryBlocks,
    loading: loadingMemory,
    error: memoryError,
    createBlock,
    updateBlock,
    deleteBlock,
  } = useMemoryBlocks(hasLetta ? agentId : undefined);

  // LLM Configuration (Letta is core infrastructure)
  const {
    config: llmConfig,
    availableModels: llmModels,
    loading: loadingLLM,
    error: llmError,
    updateConfig: updateLLMConfig,
  } = useLLMConfig(hasLetta ? agentId : undefined);

  // Tool attachments
  const {
    attachedTools,
    unattachedTools,
    loading: loadingTools,
    error: toolsError,
    attachTool,
    detachTool,
  } = useAgentTools(agentId);

  const [editName, setEditName] = useState<string | null>(null);
  const [showAddModule, setShowAddModule] = useState(false);
  const [selectedModule, setSelectedModule] = useState('');
  const [showModuleConfig, setShowModuleConfig] = useState<string | null>(null);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [configuringModule, setConfiguringModule] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingModule, setAddingModule] = useState(false);

  const handleSaveName = async () => {
    if (!editName || !agent) return;
    setSaving(true);
    try {
      await updateAgent({ name: editName });
      setEditName(null);
    } catch (err) {
      console.error('Failed to update name:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    try {
      await toggleEnabled();
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const handleAddModule = async () => {
    if (!selectedModule) return;

    // Check if module requires configuration
    if (MODULES_REQUIRING_CONFIG.includes(selectedModule)) {
      setShowModuleConfig(selectedModule);
      setShowAddModule(false);
      return;
    }

    // Add module without config
    setAddingModule(true);
    try {
      await addModule(selectedModule);
      setShowAddModule(false);
      setSelectedModule('');
    } catch (err) {
      console.error('Failed to add module:', err);
      alert(err instanceof Error ? err.message : 'Failed to add module');
    } finally {
      setAddingModule(false);
    }
  };

  const handleAddModuleWithConfig = async (moduleName: string, moduleConfig: Record<string, unknown>) => {
    setAddingModule(true);
    try {
      // AddModuleRequest expects { config: ModuleInitConfig }
      await addModule(moduleName, { config: moduleConfig });
      setShowModuleConfig(null);
      setSelectedModule('');
    } catch (err) {
      console.error('Failed to add module:', err);
      alert(err instanceof Error ? err.message : 'Failed to add module');
    } finally {
      setAddingModule(false);
    }
  };

  const handleCancelModuleConfig = () => {
    setShowModuleConfig(null);
    setSelectedModule('');
  };

  const handleRemoveModule = async (moduleName: string) => {
    if (!confirm(`Remove module "${moduleName}"?`)) return;
    try {
      await removeModule(moduleName);
    } catch (err) {
      console.error('Failed to remove module:', err);
    }
  };

  const handleModelChange = async (model: string) => {
    if (!agentId) return;
    const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update model');
    }
    // Refresh agent data
    await refetch();
  };

  const handleBlueskyConfigSave = async (config: BlueskyConfig) => {
    if (!agentId) return;
    try {
      const response = await apiFetch(
        `/api/admin/agents/${encodeURIComponent(agentId)}/modules/bluesky/config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update config');
      }
      setConfiguringModule(null);
      await refetch();
    } catch (err) {
      console.error('Failed to update bluesky config:', err);
      alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const [blueskyConfig, setBlueskyConfig] = useState<BlueskyConfig | null>(null);
  const [loadingBlueskyConfig, setLoadingBlueskyConfig] = useState(false);

  const loadBlueskyConfig = async () => {
    if (!agentId) return;
    setLoadingBlueskyConfig(true);
    try {
      const response = await apiFetch(
        `/api/admin/agents/${encodeURIComponent(agentId)}/modules/bluesky/config`
      );
      if (response.ok) {
        const data = await response.json();
        setBlueskyConfig(data.data?.config || {});
      }
    } catch (err) {
      console.error('Failed to load bluesky config:', err);
    } finally {
      setLoadingBlueskyConfig(false);
    }
  };

  const renderModuleEditor = (moduleName: string, moduleState: Record<string, unknown> | null) => {
    if (moduleName === 'bluesky' && agentId) {
      // Load config on first render
      if (!blueskyConfig && !loadingBlueskyConfig) {
        loadBlueskyConfig();
      }

      if (loadingBlueskyConfig) {
        return <div className={styles.loading}>Loading config...</div>;
      }

      return (
        <BlueskyConfigForm
          initialConfig={blueskyConfig || undefined}
          onSubmit={handleBlueskyConfigSave}
          onCancel={() => setConfiguringModule(null)}
        />
      );
    }

    // Spatial module - use state editor
    if (moduleName === 'spatial' && agentId) {
      return (
        <SpatialStateEditor
          agentId={agentId}
          onClose={() => setConfiguringModule(null)}
        />
      );
    }

    // Body and inventory module - use state editor
    if (moduleName === 'body_and_inventory' && agentId) {
      return (
        <EmbodimentStateEditor
          agentId={agentId}
          onClose={() => setConfiguringModule(null)}
        />
      );
    }

    // For other modules, show JSON state viewer (read-only for now)
    return (
      <JsonStateEditor
        moduleName={moduleName}
        state={moduleState as Record<string, unknown> | null}
        readOnly={true}
      />
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const agentModuleNames = agent?.modules ?? [];
  const availableToAdd = availableModules.filter((m) => !agentModuleNames.includes(m.name));

  if (loading) {
    return <div className={styles.loading}>Loading agent...</div>;
  }

  if (error || !agent) {
    return (
      <div className={styles.error}>
        <p>{error || 'Agent not found'}</p>
        <Link to="/admin/agents" className={styles.backLink}>
          &larr; Back to Agents
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link to="/admin/agents" className={styles.backLink}>
        &larr; Back to Agents
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{agent.id}</h1>
        <div className={styles.headerActions}>
          <Link to={`/?agent=${agent.id}`} className={styles.chatLink}>
            Chat with Agent
          </Link>
          <StatusBadge status={agent.enabled ? 'enabled' : 'disabled'} />
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>General</h2>
        <div className={styles.card}>
          <div className={styles.field}>
            <span className={styles.label}>ID</span>
            <span className={styles.value}>{agent.id}</span>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Name</span>
            {editName !== null ? (
              <div className={styles.editRow}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={styles.input}
                />
                <button onClick={handleSaveName} disabled={saving} className={styles.saveButton}>
                  Save
                </button>
                <button onClick={() => setEditName(null)} className={styles.cancelButton}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.editRow}>
                <span className={styles.value}>{agent.name}</span>
                <button onClick={() => setEditName(agent.name)} className={styles.editButton}>
                  Edit
                </button>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Status</span>
            <div className={styles.editRow}>
              <StatusBadge status={agent.enabled ? 'enabled' : 'disabled'} />
              <button
                onClick={handleToggle}
                className={agent.enabled ? styles.disableButton : styles.enableButton}
              >
                {agent.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Created</span>
            <span className={styles.value}>{formatDate(agent.created_at)}</span>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Updated</span>
            <span className={styles.value}>{formatDate(agent.updated_at)}</span>
          </div>
        </div>
      </div>

      {/* Memory Blocks Section - Letta is core infrastructure for all enabled agents */}
      {hasLetta && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Memory Blocks</h2>
          <MemoryBlockEditor
            blocks={memoryBlocks}
            loading={loadingMemory}
            error={memoryError}
            onCreateBlock={createBlock}
            onUpdateBlock={updateBlock}
            onDeleteBlock={deleteBlock}
          />
        </div>
      )}

      {/* LLM Configuration Section - Letta is core infrastructure for all enabled agents */}
      {hasLetta && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>LLM Configuration</h2>
          <LLMConfigSection
            config={llmConfig}
            availableModels={llmModels}
            loading={loadingLLM}
            error={llmError}
            onUpdateConfig={updateLLMConfig}
          />
        </div>
      )}

      {/* Tools Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Tools</h2>
        <ToolManager
          attachedTools={attachedTools}
          unattachedTools={unattachedTools}
          loading={loadingTools}
          error={toolsError}
          onAttachTool={attachTool}
          onDetachTool={detachTool}
        />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Modules ({agentModuleNames.length})</h2>
          <button onClick={() => setShowAddModule(true)} className={styles.addButton}>
            + Add Module
          </button>
        </div>

        {showAddModule && (
          <div className={styles.addModuleForm}>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className={styles.select}
              disabled={addingModule}
            >
              <option value="">Select a module...</option>
              {availableToAdd.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} (v{m.version})
                </option>
              ))}
            </select>
            <button
              onClick={handleAddModule}
              disabled={!selectedModule || addingModule}
              className={styles.addConfirmButton}
            >
              {addingModule ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => setShowAddModule(false)}
              className={styles.cancelButton}
              disabled={addingModule}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Module configuration forms */}
        {showModuleConfig === 'bluesky' && (
          <BlueskyConfigForm
            onSubmit={(config: BlueskyConfig) => handleAddModuleWithConfig('bluesky', config as unknown as Record<string, unknown>)}
            onCancel={handleCancelModuleConfig}
            loading={addingModule}
          />
        )}

        {agentModuleNames.length === 0 ? (
          <div className={styles.empty}>No modules configured</div>
        ) : (
          <div className={styles.moduleList}>
            {agentModuleNames.map((name) => {
              const moduleInfo = availableModules.find((m) => m.name === name);
              const moduleState = state?.[name] as Record<string, unknown> | undefined;
              const isConfiguring = configuringModule === name;
              const isExpanded = expandedModule === name;

              return (
                <div key={name} className={styles.moduleCard}>
                  <div
                    className={styles.moduleHeader}
                    onClick={() => {
                      if (isConfiguring) return; // Don't collapse when configuring
                      setExpandedModule(isExpanded ? null : name);
                    }}
                  >
                    <span className={styles.moduleName}>{name}</span>
                    <div className={styles.moduleMeta}>
                      {moduleInfo && <span className={styles.versionBadge}>v{moduleInfo.version}</span>}
                      {!isConfiguring && (
                        <button
                          className={styles.configureButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfiguringModule(name);
                            setExpandedModule(name);
                          }}
                        >
                          Configure
                        </button>
                      )}
                      <span className={styles.expandIcon}>
                        {isExpanded || isConfiguring ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>
                  {(isExpanded || isConfiguring) && (
                    <div className={styles.moduleBody}>
                      {isConfiguring ? (
                        <>
                          <div className={styles.configHeader}>
                            <h4 className={styles.stateTitle}>Configure {name}</h4>
                            <button
                              className={styles.closeButton}
                              onClick={() => setConfiguringModule(null)}
                            >
                              Close
                            </button>
                          </div>
                          {renderModuleEditor(name, moduleState ?? null)}
                        </>
                      ) : (
                        <>
                          {moduleState ? (
                            <>
                              <h4 className={styles.stateTitle}>Runtime State</h4>
                              <pre className={styles.configCode}>
                                {JSON.stringify(moduleState, null, 2)}
                              </pre>
                            </>
                          ) : (
                            <p className={styles.noState}>No runtime state (module not initialized)</p>
                          )}
                        </>
                      )}
                      <div className={styles.moduleActions}>
                        <button
                          onClick={() => handleRemoveModule(name)}
                          className={styles.removeButton}
                        >
                          Remove Module
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
    </div>
  );
};

export default AgentDetailPage;
