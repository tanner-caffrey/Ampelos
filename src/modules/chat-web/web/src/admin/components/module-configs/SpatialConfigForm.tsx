import { useState } from 'react';
import styles from './ModuleConfigForm.module.scss';

export interface SpatialConfig {
  worlds?: Record<string, WorldConfig>;
}

export interface WorldConfig {
  name: string;
  description: string;
  default_location: string;
  locations: Record<string, LocationConfig>;
}

export interface LocationConfig {
  description: string;
  connections?: string[];
  part_of?: string;
}

interface SpatialConfigFormProps {
  config: SpatialConfig;
  onChange: (config: SpatialConfig) => void;
}

export const getDefaultSpatialConfig = (): SpatialConfig => ({
  worlds: {
    void: {
      name: 'The Void',
      description: 'An empty, featureless space that serves as the default world.',
      default_location: 'empty',
      locations: {
        empty: {
          description: 'An empty, featureless void. There is nothing here.',
        },
      },
    },
  },
});

const SpatialConfigForm: React.FC<SpatialConfigFormProps> = ({ config, onChange }) => {
  const [expandedWorld, setExpandedWorld] = useState<string | null>(null);
  const [newWorldId, setNewWorldId] = useState('');

  const worlds = config.worlds || {};

  const updateWorld = (worldId: string, updates: Partial<WorldConfig>) => {
    onChange({
      worlds: {
        ...worlds,
        [worldId]: {
          ...worlds[worldId],
          ...updates,
        },
      },
    });
  };

  const addWorld = () => {
    if (!newWorldId || worlds[newWorldId]) return;
    onChange({
      worlds: {
        ...worlds,
        [newWorldId]: {
          name: newWorldId.charAt(0).toUpperCase() + newWorldId.slice(1),
          description: '',
          default_location: 'start',
          locations: {
            start: {
              description: 'The starting location.',
            },
          },
        },
      },
    });
    setNewWorldId('');
    setExpandedWorld(newWorldId);
  };

  const removeWorld = (worldId: string) => {
    const newWorlds = { ...worlds };
    delete newWorlds[worldId];
    onChange({ worlds: newWorlds });
  };

  const addLocation = (worldId: string, locationId: string) => {
    if (!locationId || worlds[worldId].locations[locationId]) return;
    updateWorld(worldId, {
      locations: {
        ...worlds[worldId].locations,
        [locationId]: {
          description: '',
        },
      },
    });
  };

  const updateLocation = (worldId: string, locationId: string, updates: Partial<LocationConfig>) => {
    updateWorld(worldId, {
      locations: {
        ...worlds[worldId].locations,
        [locationId]: {
          ...worlds[worldId].locations[locationId],
          ...updates,
        },
      },
    });
  };

  const removeLocation = (worldId: string, locationId: string) => {
    const newLocations = { ...worlds[worldId].locations };
    delete newLocations[locationId];
    updateWorld(worldId, { locations: newLocations });
  };

  return (
    <div className={styles.form}>
      <h3 className={styles.formTitle}>Spatial Configuration</h3>
      <p className={styles.formHint}>
        Define worlds and locations for spatial awareness. A default "void" world is created if empty.
      </p>

      <div className={styles.addRow}>
        <input
          type="text"
          value={newWorldId}
          onChange={(e) => setNewWorldId(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
          placeholder="World ID (e.g., my_world)"
          className={styles.input}
        />
        <button onClick={addWorld} disabled={!newWorldId} className={styles.addButton}>
          + Add World
        </button>
      </div>

      {Object.keys(worlds).length === 0 ? (
        <div className={styles.empty}>
          No worlds configured. Default "void" world will be used.
        </div>
      ) : (
        Object.entries(worlds).map(([worldId, worldConfig]) => (
          <div key={worldId} className={styles.worldCard}>
            <div
              className={styles.worldHeader}
              onClick={() => setExpandedWorld(expandedWorld === worldId ? null : worldId)}
            >
              <span className={styles.worldName}>{worldConfig.name || worldId}</span>
              <div className={styles.worldMeta}>
                <span className={styles.locationCount}>
                  {Object.keys(worldConfig.locations).length} locations
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWorld(worldId);
                  }}
                  className={styles.removeButton}
                >
                  ×
                </button>
                <span className={styles.expandIcon}>
                  {expandedWorld === worldId ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {expandedWorld === worldId && (
              <div className={styles.worldBody}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Display Name</label>
                  <input
                    type="text"
                    value={worldConfig.name}
                    onChange={(e) => updateWorld(worldId, { name: e.target.value })}
                    className={styles.input}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Description</label>
                  <textarea
                    value={worldConfig.description}
                    onChange={(e) => updateWorld(worldId, { description: e.target.value })}
                    className={styles.textarea}
                    rows={2}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Default Location</label>
                  <select
                    value={worldConfig.default_location}
                    onChange={(e) => updateWorld(worldId, { default_location: e.target.value })}
                    className={styles.select}
                  >
                    {Object.keys(worldConfig.locations).map((locId) => (
                      <option key={locId} value={locId}>
                        {locId}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.subsection}>
                  <div className={styles.subsectionHeader}>
                    <span className={styles.subLabel}>Locations</span>
                    <input
                      type="text"
                      placeholder="New location ID"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addLocation(worldId, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      className={styles.inlineInput}
                    />
                  </div>

                  {Object.entries(worldConfig.locations).map(([locId, locConfig]) => (
                    <div key={locId} className={styles.locationItem}>
                      <div className={styles.locationHeader}>
                        <span className={styles.locationName}>{locId}</span>
                        <button
                          onClick={() => removeLocation(worldId, locId)}
                          className={styles.removeButton}
                        >
                          ×
                        </button>
                      </div>
                      <textarea
                        value={locConfig.description}
                        onChange={(e) =>
                          updateLocation(worldId, locId, { description: e.target.value })
                        }
                        placeholder="Location description..."
                        className={styles.textarea}
                        rows={2}
                      />
                      <input
                        type="text"
                        value={locConfig.connections?.join(', ') || ''}
                        onChange={(e) =>
                          updateLocation(worldId, locId, {
                            connections: e.target.value
                              ? e.target.value.split(',').map((s) => s.trim())
                              : undefined,
                          })
                        }
                        placeholder="Connections (comma-separated)"
                        className={styles.input}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default SpatialConfigForm;
