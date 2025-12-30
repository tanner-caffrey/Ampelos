import { useState } from 'react';
import styles from './ModuleConfigForm.module.scss';

export interface BodyInventoryConfig {
  default_body_parts?: Record<string, BodyPartConfig>;
  max_inventory_items?: number;
}

export interface BodyPartConfig {
  descriptors: Record<string, string>;
}

interface BodyInventoryConfigFormProps {
  config: BodyInventoryConfig;
  onChange: (config: BodyInventoryConfig) => void;
}

const DEFAULT_BODY_PARTS = [
  'head',
  'face',
  'eyes',
  'hair',
  'torso',
  'arms',
  'hands',
  'legs',
  'feet',
];

export const getDefaultBodyInventoryConfig = (): BodyInventoryConfig => ({
  default_body_parts: DEFAULT_BODY_PARTS.reduce(
    (acc, part) => ({
      ...acc,
      [part]: { descriptors: {} },
    }),
    {}
  ),
  max_inventory_items: 100,
});

const BodyInventoryConfigForm: React.FC<BodyInventoryConfigFormProps> = ({ config, onChange }) => {
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [newPartName, setNewPartName] = useState('');
  const [newDescriptorKey, setNewDescriptorKey] = useState('');

  const bodyParts = config.default_body_parts || {};

  const updateBodyPart = (partName: string, descriptors: Record<string, string>) => {
    onChange({
      ...config,
      default_body_parts: {
        ...bodyParts,
        [partName]: { descriptors },
      },
    });
  };

  const addBodyPart = () => {
    if (!newPartName || bodyParts[newPartName]) return;
    onChange({
      ...config,
      default_body_parts: {
        ...bodyParts,
        [newPartName]: { descriptors: {} },
      },
    });
    setNewPartName('');
  };

  const removeBodyPart = (partName: string) => {
    const newParts = { ...bodyParts };
    delete newParts[partName];
    onChange({
      ...config,
      default_body_parts: newParts,
    });
  };

  const addDescriptor = (partName: string) => {
    if (!newDescriptorKey) return;
    const currentDescriptors = bodyParts[partName]?.descriptors || {};
    if (currentDescriptors[newDescriptorKey]) return;
    updateBodyPart(partName, {
      ...currentDescriptors,
      [newDescriptorKey]: '',
    });
    setNewDescriptorKey('');
  };

  const updateDescriptor = (partName: string, key: string, value: string) => {
    const currentDescriptors = bodyParts[partName]?.descriptors || {};
    updateBodyPart(partName, {
      ...currentDescriptors,
      [key]: value,
    });
  };

  const removeDescriptor = (partName: string, key: string) => {
    const currentDescriptors = { ...bodyParts[partName]?.descriptors };
    delete currentDescriptors[key];
    updateBodyPart(partName, currentDescriptors);
  };

  return (
    <div className={styles.form}>
      <h3 className={styles.formTitle}>Body & Inventory Configuration</h3>
      <p className={styles.formHint}>
        Configure the agent's physical body parts and inventory capacity.
      </p>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>Max Inventory Items</label>
        <input
          type="number"
          value={config.max_inventory_items || 100}
          onChange={(e) =>
            onChange({
              ...config,
              max_inventory_items: parseInt(e.target.value) || 100,
            })
          }
          className={styles.input}
          min={1}
          max={1000}
        />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Body Parts</h4>
        </div>

        <div className={styles.addRow}>
          <input
            type="text"
            value={newPartName}
            onChange={(e) => setNewPartName(e.target.value.toLowerCase())}
            placeholder="New body part name"
            className={styles.input}
          />
          <button onClick={addBodyPart} disabled={!newPartName} className={styles.addButton}>
            + Add Part
          </button>
        </div>

        <div className={styles.quickAdd}>
          <span className={styles.quickAddLabel}>Quick add:</span>
          {DEFAULT_BODY_PARTS.filter((p) => !bodyParts[p]).map((part) => (
            <button
              key={part}
              onClick={() =>
                onChange({
                  ...config,
                  default_body_parts: {
                    ...bodyParts,
                    [part]: { descriptors: {} },
                  },
                })
              }
              className={styles.quickAddButton}
            >
              {part}
            </button>
          ))}
        </div>

        {Object.keys(bodyParts).length === 0 ? (
          <div className={styles.empty}>
            No body parts configured. Default parts will be created.
          </div>
        ) : (
          Object.entries(bodyParts).map(([partName, partConfig]) => (
            <div key={partName} className={styles.bodyPartCard}>
              <div
                className={styles.bodyPartHeader}
                onClick={() => setExpandedPart(expandedPart === partName ? null : partName)}
              >
                <span className={styles.partName}>{partName}</span>
                <div className={styles.partMeta}>
                  <span className={styles.descriptorCount}>
                    {Object.keys(partConfig.descriptors).length} descriptors
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBodyPart(partName);
                    }}
                    className={styles.removeButton}
                  >
                    ×
                  </button>
                  <span className={styles.expandIcon}>
                    {expandedPart === partName ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {expandedPart === partName && (
                <div className={styles.bodyPartBody}>
                  <div className={styles.descriptorAddRow}>
                    <input
                      type="text"
                      value={newDescriptorKey}
                      onChange={(e) => setNewDescriptorKey(e.target.value)}
                      placeholder="Descriptor key (e.g., color, style)"
                      className={styles.input}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addDescriptor(partName);
                        }
                      }}
                    />
                    <button
                      onClick={() => addDescriptor(partName)}
                      disabled={!newDescriptorKey}
                      className={styles.addButton}
                    >
                      +
                    </button>
                  </div>

                  {Object.entries(partConfig.descriptors).length === 0 ? (
                    <div className={styles.emptyDescriptors}>
                      No descriptors. Add some to describe this body part.
                    </div>
                  ) : (
                    Object.entries(partConfig.descriptors).map(([key, value]) => (
                      <div key={key} className={styles.descriptorRow}>
                        <span className={styles.descriptorKey}>{key}</span>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => updateDescriptor(partName, key, e.target.value)}
                          placeholder={`Value for ${key}`}
                          className={styles.input}
                        />
                        <button
                          onClick={() => removeDescriptor(partName, key)}
                          className={styles.removeButton}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BodyInventoryConfigForm;
