import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAgentTemplates } from '../hooks/useTemplates';
import { useAvailableModules } from '../hooks/useModules';
import LettaConfigForm, { getDefaultLettaConfig, LettaConfig } from '../components/module-configs/LettaConfigForm';
import SpatialConfigForm, { getDefaultSpatialConfig, SpatialConfig } from '../components/module-configs/SpatialConfigForm';
import BodyInventoryConfigForm, { getDefaultBodyInventoryConfig, BodyInventoryConfig } from '../components/module-configs/BodyInventoryConfigForm';
import type { ModuleInitConfig } from '../types/admin';
import * as api from '../api/adminClient';
import styles from './AgentCreatePage.module.scss';

type CreateMode = 'manual' | 'template';

// Default modules to enable for new agents
const DEFAULT_ENABLED_MODULES = ['chat-web'];

// Modules that can be configured at creation time (optional)
const CONFIGURABLE_MODULES = [
  { name: 'spatial', label: 'Spatial', description: 'Configure spatial worlds and locations' },
  { name: 'body_and_inventory', label: 'Body & Inventory', description: 'Configure embodiment and inventory' },
];

interface ModuleConfigs {
  letta: LettaConfig;
  spatial?: SpatialConfig;
  body_and_inventory?: BodyInventoryConfig;
}

const AgentCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { templates } = useAgentTemplates();
  const { modules: availableModules } = useAvailableModules();

  const [mode, setMode] = useState<CreateMode>('manual');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual mode state
  const [agentId, setAgentId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [moduleConfigs, setModuleConfigs] = useState<ModuleConfigs>({
    letta: getDefaultLettaConfig(),
  });
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Module selection - which modules to enable for this agent
  const [enabledModules, setEnabledModules] = useState<Set<string>>(
    new Set(DEFAULT_ENABLED_MODULES)
  );

  const toggleModuleEnabled = (moduleName: string) => {
    setEnabledModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleName)) {
        next.delete(moduleName);
      } else {
        next.add(moduleName);
      }
      return next;
    });
  };

  // Template mode state
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);

  const toggleModule = (moduleName: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleName)) {
        next.delete(moduleName);
        // Remove config when collapsing
        setModuleConfigs((configs) => {
          const newConfigs = { ...configs };
          delete newConfigs[moduleName as keyof ModuleConfigs];
          return newConfigs;
        });
      } else {
        next.add(moduleName);
        // Initialize default config when expanding
        if (moduleName === 'spatial') {
          setModuleConfigs((configs) => ({ ...configs, spatial: getDefaultSpatialConfig() }));
        } else if (moduleName === 'body_and_inventory') {
          setModuleConfigs((configs) => ({ ...configs, body_and_inventory: getDefaultBodyInventoryConfig() }));
        }
      }
      return next;
    });
  };

  const handleManualCreate = async () => {
    if (!agentId || !agentName) {
      setError('Agent ID and Name are required');
      return;
    }

    // Validate Letta config
    const lettaConfig = moduleConfigs.letta.letta_agent_config;
    if (!lettaConfig.model || !lettaConfig.embedding) {
      setError('Letta configuration requires model and embedding selection');
      return;
    }
    if (Object.keys(lettaConfig.memory_blocks).length === 0) {
      setError('Letta configuration requires at least one memory block');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // Build module configs for the request
      const module_configs: Record<string, ModuleInitConfig> = {
        letta: moduleConfigs.letta as ModuleInitConfig,
      };

      // Add optional module configs
      if (moduleConfigs.spatial) {
        module_configs.spatial = moduleConfigs.spatial as ModuleInitConfig;
      }
      if (moduleConfigs.body_and_inventory) {
        module_configs.body_and_inventory = moduleConfigs.body_and_inventory as ModuleInitConfig;
      }

      await api.createAgent({
        id: agentId,
        name: agentName,
        enabled,
        module_configs,
        enabled_modules: Array.from(enabledModules),
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

  const renderModuleConfig = (moduleName: string) => {
    switch (moduleName) {
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
          {/* Basic Info */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Basic Information</h2>
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
          </div>

          {/* Letta Configuration (Required) */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Letta Configuration</h2>
            <p className={styles.sectionHint}>Configure the AI model and memory for this agent.</p>
            <LettaConfigForm
              config={moduleConfigs.letta}
              onChange={(config) => setModuleConfigs((prev) => ({ ...prev, letta: config }))}
            />
          </div>

          {/* Module Selection */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Module Selection</h2>
            <p className={styles.sectionHint}>
              Select which modules to enable for this agent. Only enabled modules will be initialized.
              You can change this later from the agent detail page.
            </p>

            <div className={styles.moduleSelectionList}>
              {availableModules.map((mod) => {
                const isChecked = enabledModules.has(mod.name);
                return (
                  <label
                    key={mod.name}
                    className={`${styles.moduleCheckboxItem} ${isChecked ? styles.checked : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleModuleEnabled(mod.name)}
                    />
                    <div className={styles.moduleCheckboxInfo}>
                      <span className={styles.moduleCheckboxName}>{mod.name}</span>
                      {mod.description && (
                        <span className={styles.moduleCheckboxDesc}>{mod.description}</span>
                      )}
                    </div>
                    <span className={styles.moduleCheckboxVersion}>v{mod.version}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Optional Module Configuration */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Optional Module Configuration</h2>
            <p className={styles.sectionHint}>
              Configure additional modules at creation time. These can also be configured later.
            </p>

            <div className={styles.moduleList}>
              {CONFIGURABLE_MODULES.map((mod) => {
                const isExpanded = expandedModules.has(mod.name);
                return (
                  <div key={mod.name} className={styles.moduleItem}>
                    <div
                      className={`${styles.moduleHeader} ${isExpanded ? styles.expanded : ''}`}
                      onClick={() => toggleModule(mod.name)}
                    >
                      <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                      <div className={styles.moduleInfo}>
                        <span className={styles.moduleName}>{mod.label}</span>
                        <span className={styles.moduleDescription}>{mod.description}</span>
                      </div>
                    </div>
                    {isExpanded && (
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
