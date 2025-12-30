import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAvailableModules } from '../hooks/useModules';
import { useAgentTemplates } from '../hooks/useTemplates';
import LettaConfigForm, { getDefaultLettaConfig, LettaConfig } from '../components/module-configs/LettaConfigForm';
import SpatialConfigForm, { getDefaultSpatialConfig, SpatialConfig } from '../components/module-configs/SpatialConfigForm';
import BodyInventoryConfigForm, { getDefaultBodyInventoryConfig, BodyInventoryConfig } from '../components/module-configs/BodyInventoryConfigForm';
import type { ModuleInitConfig } from '../types/admin';
import * as api from '../api/adminClient';
import styles from './AgentCreatePage.module.scss';

type CreateMode = 'manual' | 'template';

// Modules that have configuration forms
const CONFIGURABLE_MODULES = ['letta', 'spatial', 'body_and_inventory'];

interface ModuleConfigs {
  letta?: LettaConfig;
  spatial?: SpatialConfig;
  body_and_inventory?: BodyInventoryConfig;
}

const AgentCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { modules: availableModules } = useAvailableModules();
  const { templates } = useAgentTemplates();

  const [mode, setMode] = useState<CreateMode>('manual');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual mode state
  const [agentId, setAgentId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [moduleConfigs, setModuleConfigs] = useState<ModuleConfigs>({});
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Template mode state
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);

  const handleManualCreate = async () => {
    if (!agentId || !agentName) {
      setError('Agent ID and Name are required');
      return;
    }

    // Validate letta config if selected
    if (selectedModules.includes('letta') && moduleConfigs.letta) {
      const lettaConfig = moduleConfigs.letta.letta_agent_config;
      if (!lettaConfig.model || !lettaConfig.embedding) {
        setError('Letta module requires model and embedding selection');
        return;
      }
      if (Object.keys(lettaConfig.memory_blocks).length === 0) {
        setError('Letta module requires at least one memory block');
        return;
      }
    }

    setCreating(true);
    setError(null);

    try {
      // Build module configs for the request
      const module_configs: Record<string, ModuleInitConfig> = {};

      for (const mod of selectedModules) {
        // Get the configuration for configurable modules
        if (mod === 'letta' && moduleConfigs.letta) {
          module_configs[mod] = moduleConfigs.letta as ModuleInitConfig;
        } else if (mod === 'spatial' && moduleConfigs.spatial) {
          module_configs[mod] = moduleConfigs.spatial as ModuleInitConfig;
        } else if (mod === 'body_and_inventory' && moduleConfigs.body_and_inventory) {
          module_configs[mod] = moduleConfigs.body_and_inventory as ModuleInitConfig;
        }
        // Non-configurable modules don't need configs
      }

      await api.createAgent({
        id: agentId,
        name: agentName,
        enabled,
        modules: selectedModules,
        module_configs,
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

  const handleModuleToggle = (moduleName: string) => {
    const isSelected = selectedModules.includes(moduleName);

    if (isSelected) {
      // Remove module
      setSelectedModules((prev) => prev.filter((m) => m !== moduleName));
      setModuleConfigs((prev) => {
        const newConfigs = { ...prev };
        delete newConfigs[moduleName as keyof ModuleConfigs];
        return newConfigs;
      });
      if (expandedModule === moduleName) {
        setExpandedModule(null);
      }
    } else {
      // Add module with default config
      setSelectedModules((prev) => [...prev, moduleName]);

      // Initialize default config for configurable modules
      if (moduleName === 'letta') {
        setModuleConfigs((prev) => ({ ...prev, letta: getDefaultLettaConfig() }));
        setExpandedModule('letta');
      } else if (moduleName === 'spatial') {
        setModuleConfigs((prev) => ({ ...prev, spatial: getDefaultSpatialConfig() }));
        setExpandedModule('spatial');
      } else if (moduleName === 'body_and_inventory') {
        setModuleConfigs((prev) => ({ ...prev, body_and_inventory: getDefaultBodyInventoryConfig() }));
        setExpandedModule('body_and_inventory');
      }
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setTemplateVariables({ agent_id: '', agent_name: '' });
  };

  const isConfigurable = (moduleName: string) => CONFIGURABLE_MODULES.includes(moduleName);

  const renderModuleConfig = (moduleName: string) => {
    switch (moduleName) {
      case 'letta':
        return moduleConfigs.letta ? (
          <LettaConfigForm
            config={moduleConfigs.letta}
            onChange={(config) => setModuleConfigs((prev) => ({ ...prev, letta: config }))}
          />
        ) : null;
      case 'spatial':
        return moduleConfigs.spatial ? (
          <SpatialConfigForm
            config={moduleConfigs.spatial}
            onChange={(config) => setModuleConfigs((prev) => ({ ...prev, spatial: config }))}
          />
        ) : null;
      case 'body_and_inventory':
        return moduleConfigs.body_and_inventory ? (
          <BodyInventoryConfigForm
            config={moduleConfigs.body_and_inventory}
            onChange={(config) => setModuleConfigs((prev) => ({ ...prev, body_and_inventory: config }))}
          />
        ) : null;
      default:
        return null;
    }
  };

  // Sort modules: configurable first, then alphabetically
  const sortedModules = [...availableModules].sort((a, b) => {
    const aConfigurable = isConfigurable(a.name);
    const bConfigurable = isConfigurable(b.name);
    if (aConfigurable && !bConfigurable) return -1;
    if (!aConfigurable && bConfigurable) return 1;
    return a.name.localeCompare(b.name);
  });

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

          <div className={styles.field}>
            <label className={styles.label}>Modules</label>
            <p className={styles.hint}>
              Select modules to enable. Configurable modules (letta, spatial, body_and_inventory) will show configuration options when selected.
            </p>

            <div className={styles.moduleList}>
              {sortedModules.map((mod) => {
                const isSelected = selectedModules.includes(mod.name);
                const hasConfig = isConfigurable(mod.name);
                const isExpanded = expandedModule === mod.name;

                return (
                  <div key={mod.name} className={styles.moduleItem}>
                    <div
                      className={`${styles.moduleHeader} ${isSelected ? styles.selected : ''}`}
                      onClick={() => handleModuleToggle(mod.name)}
                    >
                      <div className={styles.moduleCheckbox}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className={styles.moduleInfo}>
                        <span className={styles.moduleName}>{mod.name}</span>
                        <span className={styles.moduleVersion}>v{mod.version}</span>
                        {hasConfig && <span className={styles.configurableBadge}>configurable</span>}
                      </div>
                      {isSelected && hasConfig && (
                        <button
                          className={styles.expandButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedModule(isExpanded ? null : mod.name);
                          }}
                        >
                          {isExpanded ? '▼ Hide Config' : '▶ Configure'}
                        </button>
                      )}
                    </div>

                    {isSelected && hasConfig && isExpanded && (
                      <div className={styles.moduleConfigWrapper}>
                        {renderModuleConfig(mod.name)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
