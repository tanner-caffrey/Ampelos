import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import EmbodiedAgentConfigForm from '../components/module-configs/EmbodiedAgentConfigForm';
import MemoryBlockEditor from '../components/MemoryBlockEditor';
import LLMConfigSection from '../components/LLMConfigSection';
import ToolManager from '../components/ToolManager';
import * as api from '../api/adminClient';
import styles from './AgentDetailPage.module.scss';

// Module status type
interface ModulesStatus {
  [moduleName: string]: { enabled: boolean; initialized: boolean };
}

const AgentDetailPage: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const { agent, state, initializedModules, loading, error, updateAgent, toggleEnabled, refetch } =
    useAgent(agentId);
  const { modules: availableModules } = useAvailableModules();

  // Check if Letta agent exists by looking at state
  const lettaState = state?.letta as { letta_agent_id?: string; initialized?: boolean } | undefined;
  const hasLettaAgent = Boolean(lettaState?.letta_agent_id);
  const [creatingLetta, setCreatingLetta] = useState(false);
  const [lettaError, setLettaError] = useState<string | null>(null);

  const handleCreateLettaAgent = async () => {
    if (!agentId) return;
    setCreatingLetta(true);
    setLettaError(null);
    try {
      await api.createLettaAgent(agentId);
      await refetch();
    } catch (err) {
      console.error('Failed to create Letta agent:', err);
      setLettaError(err instanceof Error ? err.message : 'Failed to create Letta agent');
    } finally {
      setCreatingLetta(false);
    }
  };

  // Memory blocks and LLM config - only available when Letta agent exists
  const hasLetta = hasLettaAgent;
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
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [configuringModule, setConfiguringModule] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initializingModule, setInitializingModule] = useState<string | null>(null);

  // Module enabled status
  const [modulesStatus, setModulesStatus] = useState<ModulesStatus>({});
  const [loadingModulesStatus, setLoadingModulesStatus] = useState(false);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);

  // Load modules status
  const loadModulesStatus = useCallback(async () => {
    if (!agentId) return;
    setLoadingModulesStatus(true);
    try {
      const { modules } = await api.fetchModulesStatus(agentId);
      setModulesStatus(modules);
    } catch (err) {
      console.error('Failed to load modules status:', err);
    } finally {
      setLoadingModulesStatus(false);
    }
  }, [agentId]);

  // Load modules status on mount
  useEffect(() => {
    loadModulesStatus();
  }, [loadModulesStatus]);

  // Handle module enable/disable toggle
  const handleToggleModuleEnabled = async (moduleName: string, enabled: boolean) => {
    if (!agentId) return;
    setTogglingModule(moduleName);
    try {
      await api.setModuleEnabled(agentId, moduleName, enabled);
      // Update local state
      setModulesStatus(prev => ({
        ...prev,
        [moduleName]: { ...prev[moduleName], enabled, initialized: enabled ? prev[moduleName]?.initialized : false },
      }));
      // Refetch agent data to get updated state
      await refetch();
    } catch (err) {
      console.error('Failed to toggle module:', err);
      alert(err instanceof Error ? err.message : 'Failed to toggle module');
    } finally {
      setTogglingModule(null);
    }
  };

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

  const handleInitModule = async (moduleName: string) => {
    if (!agentId) return;
    setInitializingModule(moduleName);
    try {
      await api.initModuleForAgent(agentId, moduleName);
      await refetch(); // Refresh to get the new state
    } catch (err) {
      console.error('Failed to initialize module:', err);
      alert(err instanceof Error ? err.message : 'Failed to initialize module');
    } finally {
      setInitializingModule(null);
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

    // Embodied agent module - use config form
    if (moduleName === 'embodied-agent' && agentId) {
      return (
        <EmbodiedAgentConfigForm
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

      {/* Letta Agent Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Letta Agent</h2>
        <div className={styles.card}>
          {hasLettaAgent ? (
            <div className={styles.field}>
              <span className={styles.label}>Letta Agent ID</span>
              <span className={styles.value}>{lettaState?.letta_agent_id}</span>
            </div>
          ) : (
            <div className={styles.lettaNotCreated}>
              <p className={styles.lettaMessage}>
                No Letta agent has been created for this agent yet.
              </p>
              {lettaError && (
                <p className={styles.lettaError}>{lettaError}</p>
              )}
              <button
                onClick={handleCreateLettaAgent}
                disabled={creatingLetta}
                className={styles.createLettaButton}
              >
                {creatingLetta ? 'Creating...' : 'Create Letta Agent'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Memory Blocks Section - only available when Letta agent exists */}
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
        <h2 className={styles.sectionTitle}>Modules ({availableModules.length})</h2>
        <p className={styles.sectionDescription}>
          All modules are available to all agents. Expand a module to view state or configure it.
        </p>

        {availableModules.length === 0 ? (
          <div className={styles.empty}>No modules loaded</div>
        ) : (
          <div className={styles.moduleList}>
            {availableModules.map((moduleInfo) => {
              const name = moduleInfo.name;
              const moduleState = state?.[name] as Record<string, unknown> | undefined;
              const isInitialized = initializedModules.includes(name);
              const hasService = moduleInfo.provides.includes('service');
              // Use modulesStatus if available, default to enabled for backward compat
              const isEnabled = modulesStatus[name]?.enabled ?? true;
              const canInitialize = hasService && !isInitialized && isEnabled;
              const isInitializing = initializingModule === name;
              const isConfiguring = configuringModule === name;
              const isExpanded = expandedModule === name;
              const isToggling = togglingModule === name;

              return (
                <div key={name} className={`${styles.moduleCard} ${!isEnabled ? styles.moduleDisabled : ''}`}>
                  <div
                    className={styles.moduleHeader}
                    onClick={() => {
                      if (isConfiguring) return; // Don't collapse when configuring
                      setExpandedModule(isExpanded ? null : name);
                    }}
                  >
                    <span className={styles.moduleName}>{name}</span>
                    <div className={styles.moduleMeta}>
                      <span className={styles.versionBadge}>v{moduleInfo.version}</span>
                      {isInitialized && <span className={styles.activeBadge}>Active</span>}

                      {/* Enable/Disable toggle */}
                      <label
                        className={styles.enableToggle}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          disabled={isToggling}
                          onChange={(e) => handleToggleModuleEnabled(name, e.target.checked)}
                        />
                        <span className={styles.toggleLabel}>
                          {isToggling ? '...' : (isEnabled ? 'On' : 'Off')}
                        </span>
                      </label>

                      {/* Only show Initialize/Configure if enabled */}
                      {isEnabled && canInitialize && (
                        <button
                          className={styles.initButton}
                          disabled={isInitializing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInitModule(name);
                          }}
                        >
                          {isInitializing ? 'Initializing...' : 'Initialize'}
                        </button>
                      )}
                      {isEnabled && !isConfiguring && (
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
                      {moduleInfo.description && (
                        <p className={styles.moduleDescription}>{moduleInfo.description}</p>
                      )}
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
                            <p className={styles.noState}>
                              {hasService
                                ? 'Service not initialized. Click "Initialize" to start.'
                                : 'Tool-only module (no service state)'}
                            </p>
                          )}
                        </>
                      )}
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
