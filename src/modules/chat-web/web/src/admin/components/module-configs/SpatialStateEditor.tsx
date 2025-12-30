import { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/apiFetch';
import styles from './ModuleConfigForm.module.scss';

interface World {
  name: string;
  description?: string;
  default_location: string;
  locations: Record<string, { description?: string; positions?: string[] }>;
  agents: Record<string, { location: string; position: string }>;
}

interface SpatialState {
  agentState: {
    world_id: string;
    current_location: string;
    current_position: string;
  };
  globalState: {
    worlds: Record<string, World>;
  };
}

interface SpatialStateEditorProps {
  agentId: string;
  onClose: () => void;
}

const SpatialStateEditor: React.FC<SpatialStateEditorProps> = ({ agentId, onClose }) => {
  const [state, setState] = useState<SpatialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Selected values for actions
  const [selectedWorld, setSelectedWorld] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');

  // Fetch current state
  useEffect(() => {
    const fetchState = async () => {
      try {
        setLoading(true);
        const response = await apiFetch(
          `/api/admin/agents/${encodeURIComponent(agentId)}/modules/spatial/state`
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch state');
        }
        const data = await response.json();
        setState(data.data as SpatialState);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch state');
      } finally {
        setLoading(false);
      }
    };

    fetchState();
  }, [agentId]);

  // Initialize selected values when state loads
  useEffect(() => {
    if (state) {
      setSelectedWorld(state.agentState.world_id);
      setSelectedLocation(state.agentState.current_location);
      setSelectedPosition(state.agentState.current_position);
    }
  }, [state]);

  const handleMoveTo = async () => {
    if (!selectedLocation) return;

    setSaving(true);
    setActionError(null);

    try {
      const response = await apiFetch(
        `/api/admin/agents/${encodeURIComponent(agentId)}/modules/spatial/state`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'moveTo',
            location: selectedLocation,
            position: selectedPosition || undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to move agent');
      }

      const data = await response.json();
      setState(data.data as SpatialState);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to move agent');
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchWorld = async () => {
    if (!selectedWorld || selectedWorld === state?.agentState.world_id) return;

    setSaving(true);
    setActionError(null);

    try {
      const response = await apiFetch(
        `/api/admin/agents/${encodeURIComponent(agentId)}/modules/spatial/state`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'switchWorld',
            world_id: selectedWorld,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to switch world');
      }

      const data = await response.json();
      setState(data.data as SpatialState);
      // Reset location selection for new world
      const newWorld = data.data.globalState.worlds[selectedWorld];
      if (newWorld) {
        setSelectedLocation(newWorld.default_location);
        setSelectedPosition('here');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to switch world');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading spatial state...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!state) {
    return <div className={styles.empty}>No spatial state available</div>;
  }

  const worlds = state.globalState.worlds;
  const currentWorld = worlds[state.agentState.world_id];
  const worldIds = Object.keys(worlds);
  const locations = currentWorld ? Object.keys(currentWorld.locations) : [];
  const currentLocation = currentWorld?.locations[state.agentState.current_location];
  const positions = currentLocation?.positions || ['here'];

  return (
    <div className={styles.form}>
      <div className={styles.headerRow}>
        <h3 className={styles.formTitle}>Spatial State</h3>
        <button onClick={onClose} className={styles.closeButton} type="button">
          Close
        </button>
      </div>

      {actionError && <div className={styles.error}>{actionError}</div>}

      {/* Current State Display */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Current Position</h4>
        <div className={styles.stateGrid}>
          <div className={styles.stateItem}>
            <span className={styles.stateLabel}>World</span>
            <span className={styles.stateValue}>
              {currentWorld?.name || state.agentState.world_id}
            </span>
          </div>
          <div className={styles.stateItem}>
            <span className={styles.stateLabel}>Location</span>
            <span className={styles.stateValue}>{state.agentState.current_location}</span>
          </div>
          <div className={styles.stateItem}>
            <span className={styles.stateLabel}>Position</span>
            <span className={styles.stateValue}>{state.agentState.current_position}</span>
          </div>
        </div>
      </div>

      {/* Switch World */}
      {worldIds.length > 1 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Switch World</h4>
          <div className={styles.actionRow}>
            <select
              value={selectedWorld}
              onChange={(e) => setSelectedWorld(e.target.value)}
              className={styles.select}
              disabled={saving}
            >
              {worldIds.map((worldId) => (
                <option key={worldId} value={worldId}>
                  {worlds[worldId].name} ({worldId})
                </option>
              ))}
            </select>
            <button
              onClick={handleSwitchWorld}
              disabled={saving || selectedWorld === state.agentState.world_id}
              className={styles.actionButton}
              type="button"
            >
              {saving ? 'Switching...' : 'Switch World'}
            </button>
          </div>
          <p className={styles.hint}>
            Switching worlds moves the agent to the new world's default location.
          </p>
        </div>
      )}

      {/* Move Location */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Move to Location</h4>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Location</label>
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                // Reset position when location changes
                const loc = currentWorld?.locations[e.target.value];
                const availablePositions = loc?.positions || ['here'];
                if (!availablePositions.includes(selectedPosition)) {
                  setSelectedPosition(availablePositions[0] || 'here');
                }
              }}
              className={styles.select}
              disabled={saving}
            >
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                  {loc === state.agentState.current_location ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Position</label>
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className={styles.select}
              disabled={saving}
            >
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                  {pos === state.agentState.current_position &&
                  selectedLocation === state.agentState.current_location
                    ? ' (current)'
                    : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleMoveTo}
          disabled={
            saving ||
            (selectedLocation === state.agentState.current_location &&
              selectedPosition === state.agentState.current_position)
          }
          className={styles.actionButton}
          type="button"
        >
          {saving ? 'Moving...' : 'Move Agent'}
        </button>
      </div>

      {/* World Overview */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>World: {currentWorld?.name}</h4>
        {currentWorld?.description && (
          <p className={styles.description}>{currentWorld.description}</p>
        )}
        <div className={styles.locationsList}>
          <strong>Locations:</strong>
          <ul className={styles.plainList}>
            {locations.map((loc) => {
              const locData = currentWorld.locations[loc];
              const isCurrent = loc === state.agentState.current_location;
              return (
                <li key={loc} className={isCurrent ? styles.currentItem : ''}>
                  <strong>{loc}</strong>
                  {isCurrent && <span className={styles.currentBadge}> (current)</span>}
                  {locData?.description && (
                    <span className={styles.dimText}> - {locData.description}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SpatialStateEditor;
