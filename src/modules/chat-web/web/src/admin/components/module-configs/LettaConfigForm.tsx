import { useState, useEffect } from 'react';
import { useContentTemplates } from '../../hooks/useTemplates';
import styles from './ModuleConfigForm.module.scss';

export interface LettaConfig {
  letta_agent_config: {
    model: string;
    embedding: string;
    memory_blocks: Record<string, MemoryBlockConfig>;
    system_prompt_template: string;
    enable_sleeptime?: boolean;
  };
}

export interface MemoryBlockConfig {
  limit: number;
  template?: string;
  value?: string;
  customizations?: Record<string, string>;
}

interface LettaConfigFormProps {
  config: LettaConfig;
  onChange: (config: LettaConfig) => void;
}

const DEFAULT_MODELS = [
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-3-5-sonnet-20241022',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
];

const DEFAULT_EMBEDDINGS = [
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
  'openai/text-embedding-ada-002',
];

const DEFAULT_MEMORY_BLOCKS: Record<string, { limit: number; template?: string }> = {
  persona: { limit: 3000, template: 'persona_conversational' },
  human: { limit: 3000, template: 'human_default' },
  identity: { limit: 2000, template: 'identity_default' },
  relationship: { limit: 2000, template: 'relationship_default' },
};

export const getDefaultLettaConfig = (): LettaConfig => ({
  letta_agent_config: {
    model: 'anthropic/claude-sonnet-4-20250514',
    embedding: 'openai/text-embedding-3-small',
    memory_blocks: {
      persona: { limit: 3000, template: 'persona_conversational', customizations: { agent_name: '', core_traits: '' } },
      human: { limit: 3000, template: 'human_default', customizations: { name: '', interests: '' } },
    },
    system_prompt_template: 'conversational_companion',
    enable_sleeptime: false,
  },
});

const LettaConfigForm: React.FC<LettaConfigFormProps> = ({ config, onChange }) => {
  const { memoryBlocks: memoryTemplates, systemPrompts: promptTemplates } = useContentTemplates();
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

  const updateConfig = (updates: Partial<LettaConfig['letta_agent_config']>) => {
    onChange({
      letta_agent_config: {
        ...config.letta_agent_config,
        ...updates,
      },
    });
  };

  const updateMemoryBlock = (blockName: string, updates: Partial<MemoryBlockConfig>) => {
    const newBlocks = {
      ...config.letta_agent_config.memory_blocks,
      [blockName]: {
        ...config.letta_agent_config.memory_blocks[blockName],
        ...updates,
      },
    };
    updateConfig({ memory_blocks: newBlocks });
  };

  const addMemoryBlock = (blockName: string) => {
    if (!blockName || config.letta_agent_config.memory_blocks[blockName]) return;
    const defaults = DEFAULT_MEMORY_BLOCKS[blockName] || { limit: 2000 };
    const newBlocks = {
      ...config.letta_agent_config.memory_blocks,
      [blockName]: defaults,
    };
    updateConfig({ memory_blocks: newBlocks });
  };

  const removeMemoryBlock = (blockName: string) => {
    const newBlocks = { ...config.letta_agent_config.memory_blocks };
    delete newBlocks[blockName];
    updateConfig({ memory_blocks: newBlocks });
  };

  const getTemplateVariables = (templateName: string): string[] => {
    const template = memoryTemplates.find((t) => t.name === templateName);
    return template?.variables || [];
  };

  return (
    <div className={styles.form}>
      <h3 className={styles.formTitle}>Letta Configuration</h3>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>LLM Model</label>
        <select
          value={config.letta_agent_config.model}
          onChange={(e) => updateConfig({ model: e.target.value })}
          className={styles.select}
        >
          {DEFAULT_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>Embedding Model</label>
        <select
          value={config.letta_agent_config.embedding}
          onChange={(e) => updateConfig({ embedding: e.target.value })}
          className={styles.select}
        >
          {DEFAULT_EMBEDDINGS.map((embedding) => (
            <option key={embedding} value={embedding}>
              {embedding}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>System Prompt Template</label>
        <select
          value={config.letta_agent_config.system_prompt_template}
          onChange={(e) => updateConfig({ system_prompt_template: e.target.value })}
          className={styles.select}
        >
          {promptTemplates.map((template) => (
            <option key={template.name} value={template.name}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.letta_agent_config.enable_sleeptime || false}
            onChange={(e) => updateConfig({ enable_sleeptime: e.target.checked })}
          />
          Enable Sleeptime (background memory management)
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Memory Blocks</h4>
          <select
            onChange={(e) => {
              if (e.target.value) {
                addMemoryBlock(e.target.value);
                e.target.value = '';
              }
            }}
            className={styles.addSelect}
            defaultValue=""
          >
            <option value="">+ Add Block</option>
            {Object.keys(DEFAULT_MEMORY_BLOCKS)
              .filter((name) => !config.letta_agent_config.memory_blocks[name])
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </div>

        {Object.entries(config.letta_agent_config.memory_blocks).map(([blockName, blockConfig]) => (
          <div key={blockName} className={styles.memoryBlock}>
            <div
              className={styles.memoryBlockHeader}
              onClick={() => setExpandedBlock(expandedBlock === blockName ? null : blockName)}
            >
              <span className={styles.blockName}>{blockName}</span>
              <div className={styles.blockMeta}>
                <span className={styles.blockLimit}>{blockConfig.limit} tokens</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMemoryBlock(blockName);
                  }}
                  className={styles.removeButton}
                >
                  ×
                </button>
                <span className={styles.expandIcon}>
                  {expandedBlock === blockName ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {expandedBlock === blockName && (
              <div className={styles.memoryBlockBody}>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Token Limit</label>
                    <input
                      type="number"
                      value={blockConfig.limit}
                      onChange={(e) =>
                        updateMemoryBlock(blockName, { limit: parseInt(e.target.value) || 2000 })
                      }
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Template</label>
                    <select
                      value={blockConfig.template || ''}
                      onChange={(e) =>
                        updateMemoryBlock(blockName, {
                          template: e.target.value || undefined,
                          customizations: e.target.value
                            ? getTemplateVariables(e.target.value).reduce(
                                (acc, v) => ({ ...acc, [v]: blockConfig.customizations?.[v] || '' }),
                                {}
                              )
                            : undefined,
                        })
                      }
                      className={styles.select}
                    >
                      <option value="">No template (use value)</option>
                      {memoryTemplates.map((template) => (
                        <option key={template.name} value={template.name}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {blockConfig.template && getTemplateVariables(blockConfig.template).length > 0 && (
                  <div className={styles.customizations}>
                    <label className={styles.subLabel}>Template Variables</label>
                    {getTemplateVariables(blockConfig.template).map((varName) => (
                      <div key={varName} className={styles.fieldGroup}>
                        <label className={styles.varLabel}>{`{{${varName}}}`}</label>
                        <input
                          type="text"
                          value={blockConfig.customizations?.[varName] || ''}
                          onChange={(e) =>
                            updateMemoryBlock(blockName, {
                              customizations: {
                                ...blockConfig.customizations,
                                [varName]: e.target.value,
                              },
                            })
                          }
                          placeholder={`Value for ${varName}`}
                          className={styles.input}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {!blockConfig.template && (
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Direct Value</label>
                    <textarea
                      value={blockConfig.value || ''}
                      onChange={(e) => updateMemoryBlock(blockName, { value: e.target.value })}
                      placeholder="Enter memory block content directly..."
                      className={styles.textarea}
                      rows={4}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LettaConfigForm;
