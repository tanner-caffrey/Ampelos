import { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/apiFetch';
import styles from './ModuleConfigForm.module.scss';

interface BodyPart {
  name: string;
  descriptors: Record<string, string>;
  state?: string;  // Single state with overwrite semantics
}

interface InventoryItem {
  id: string;
  name: string;
  type?: string;
  description?: string;
  descriptors: Record<string, string>;
  properties: Record<string, unknown>;
  equipped_slot?: string;
  show_in_memory: boolean;
}

interface BodyAndInventoryState {
  body: {
    parts: Record<string, BodyPart>;
  };
  inventory: {
    items: Record<string, InventoryItem>;
  };
  letta_memory_block_created: boolean;
}

interface EmbodimentStateEditorProps {
  agentId: string;
  onClose: () => void;
}

type TabType = 'body' | 'inventory';

const EmbodimentStateEditor: React.FC<EmbodimentStateEditorProps> = ({ agentId, onClose }) => {
  const [state, setState] = useState<BodyAndInventoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('body');

  // Body part form
  const [newPartName, setNewPartName] = useState('');
  const [newDescriptorPart, setNewDescriptorPart] = useState('');
  const [newDescriptorKey, setNewDescriptorKey] = useState('');
  const [newDescriptorValue, setNewDescriptorValue] = useState('');
  const [newStatePart, setNewStatePart] = useState('');
  const [newStateValue, setNewStateValue] = useState('');

  // Inventory form
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [equipItemId, setEquipItemId] = useState('');
  const [equipSlot, setEquipSlot] = useState('');

  // Fetch current state
  const fetchState = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(
        `/api/admin/agents/${encodeURIComponent(agentId)}/modules/body_and_inventory/state`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch state');
      }
      const data = await response.json();
      setState(data.data.state as BodyAndInventoryState);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, [agentId]);

  const performAction = async (action: string, params: Record<string, unknown>) => {
    setSaving(true);
    setActionError(null);

    try {
      const response = await apiFetch(
        `/api/admin/agents/${encodeURIComponent(agentId)}/modules/body_and_inventory/state`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...params }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Action failed');
      }

      const data = await response.json();
      setState(data.data.state as BodyAndInventoryState);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Body part actions
  const handleCreateBodyPart = async () => {
    if (!newPartName.trim()) return;
    const success = await performAction('createBodyPart', { partName: newPartName.trim() });
    if (success) setNewPartName('');
  };

  const handleAddDescriptor = async () => {
    if (!newDescriptorPart || !newDescriptorKey.trim() || !newDescriptorValue.trim()) return;
    const success = await performAction('addBodyDescriptor', {
      partName: newDescriptorPart,
      key: newDescriptorKey.trim(),
      value: newDescriptorValue.trim(),
    });
    if (success) {
      setNewDescriptorKey('');
      setNewDescriptorValue('');
    }
  };

  const handleRemoveDescriptor = async (partName: string, key: string) => {
    await performAction('removeBodyDescriptor', { partName, key });
  };

  const handleSetState = async () => {
    if (!newStatePart || !newStateValue.trim()) return;
    const success = await performAction('setBodyState', {
      partName: newStatePart,
      bodyState: newStateValue.trim(),
    });
    if (success) setNewStateValue('');
  };

  const handleClearState = async (partName: string) => {
    await performAction('clearBodyState', { partName });
  };

  // Inventory actions
  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    const success = await performAction('addInventoryItem', {
      itemName: newItemName.trim(),
      description: newItemDescription.trim() || undefined,
    });
    if (success) {
      setNewItemName('');
      setNewItemDescription('');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm('Remove this item from inventory?')) return;
    await performAction('removeInventoryItem', { itemId });
  };

  const handleEquipItem = async () => {
    if (!equipItemId || !equipSlot.trim()) return;
    const success = await performAction('equipItem', {
      itemId: equipItemId,
      slot: equipSlot.trim(),
    });
    if (success) {
      setEquipItemId('');
      setEquipSlot('');
    }
  };

  const handleUnequipItem = async (itemId: string) => {
    await performAction('unequipItem', { itemId });
  };

  const handleToggleMemory = async (itemId: string, currentShow: boolean) => {
    await performAction('markItemForMemory', { itemId, show: !currentShow });
  };

  if (loading) {
    return <div className={styles.loading}>Loading embodiment state...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!state) {
    return <div className={styles.empty}>No embodiment state available</div>;
  }

  const bodyParts = Object.values(state.body.parts);
  const inventoryItems = Object.values(state.inventory.items);

  return (
    <div className={styles.form}>
      <div className={styles.headerRow}>
        <h3 className={styles.formTitle}>Body & Inventory</h3>
        <button onClick={onClose} className={styles.closeButton} type="button">
          Close
        </button>
      </div>

      {actionError && <div className={styles.error}>{actionError}</div>}

      {/* Tab Navigation */}
      <div className={styles.tabNav}>
        <button
          onClick={() => setActiveTab('body')}
          className={activeTab === 'body' ? styles.tabActive : styles.tab}
          type="button"
        >
          Body ({bodyParts.length})
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={activeTab === 'inventory' ? styles.tabActive : styles.tab}
          type="button"
        >
          Inventory ({inventoryItems.length})
        </button>
      </div>

      {/* Body Tab */}
      {activeTab === 'body' && (
        <div className={styles.tabContent}>
          {/* Add Body Part */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Add Body Part</h4>
            <div className={styles.actionRow}>
              <input
                type="text"
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                placeholder="Part name (e.g., head, left arm)"
                className={styles.input}
                disabled={saving}
              />
              <button
                onClick={handleCreateBodyPart}
                disabled={saving || !newPartName.trim()}
                className={styles.actionButton}
                type="button"
              >
                Add Part
              </button>
            </div>
          </div>

          {/* Add Descriptor */}
          {bodyParts.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Add Descriptor</h4>
              <div className={styles.fieldRow}>
                <select
                  value={newDescriptorPart}
                  onChange={(e) => setNewDescriptorPart(e.target.value)}
                  className={styles.select}
                  disabled={saving}
                >
                  <option value="">Select part...</option>
                  {bodyParts.map((part) => (
                    <option key={part.name} value={part.name}>
                      {part.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newDescriptorKey}
                  onChange={(e) => setNewDescriptorKey(e.target.value)}
                  placeholder="Key (e.g., color)"
                  className={styles.input}
                  disabled={saving}
                />
                <input
                  type="text"
                  value={newDescriptorValue}
                  onChange={(e) => setNewDescriptorValue(e.target.value)}
                  placeholder="Value (e.g., blue)"
                  className={styles.input}
                  disabled={saving}
                />
                <button
                  onClick={handleAddDescriptor}
                  disabled={
                    saving || !newDescriptorPart || !newDescriptorKey.trim() || !newDescriptorValue.trim()
                  }
                  className={styles.actionButton}
                  type="button"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Set State */}
          {bodyParts.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Set State</h4>
              <div className={styles.fieldRow}>
                <select
                  value={newStatePart}
                  onChange={(e) => setNewStatePart(e.target.value)}
                  className={styles.select}
                  disabled={saving}
                >
                  <option value="">Select part...</option>
                  {bodyParts.map((part) => (
                    <option key={part.name} value={part.name}>
                      {part.name}{part.state ? ` (current: ${part.state})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newStateValue}
                  onChange={(e) => setNewStateValue(e.target.value)}
                  placeholder="State (e.g., injured, glowing)"
                  className={styles.input}
                  disabled={saving}
                />
                <button
                  onClick={handleSetState}
                  disabled={saving || !newStatePart || !newStateValue.trim()}
                  className={styles.actionButton}
                  type="button"
                >
                  Set
                </button>
              </div>
            </div>
          )}

          {/* Body Parts List */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Body Parts</h4>
            {bodyParts.length === 0 ? (
              <div className={styles.empty}>No body parts defined</div>
            ) : (
              <div className={styles.itemsList}>
                {bodyParts.map((part) => (
                  <div key={part.name} className={styles.itemCard}>
                    <div className={styles.itemHeader}>
                      <strong>{part.name}</strong>
                    </div>
                    {Object.keys(part.descriptors).length > 0 && (
                      <div className={styles.itemDetails}>
                        <span className={styles.subLabel}>Descriptors:</span>
                        {Object.entries(part.descriptors).map(([key, value]) => (
                          <span key={key} className={styles.tag}>
                            {key}: {value}
                            <button
                              onClick={() => handleRemoveDescriptor(part.name, key)}
                              className={styles.tagRemove}
                              disabled={saving}
                              type="button"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {part.state && (
                      <div className={styles.itemDetails}>
                        <span className={styles.subLabel}>State:</span>
                        <span className={styles.tagWarning}>
                          {part.state}
                          <button
                            onClick={() => handleClearState(part.name)}
                            className={styles.tagRemove}
                            disabled={saving}
                            type="button"
                          >
                            x
                          </button>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className={styles.tabContent}>
          {/* Add Item */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Add Item</h4>
            <div className={styles.field}>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Item name"
                className={styles.input}
                disabled={saving}
              />
            </div>
            <div className={styles.field}>
              <input
                type="text"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                placeholder="Description (optional)"
                className={styles.input}
                disabled={saving}
              />
            </div>
            <button
              onClick={handleAddItem}
              disabled={saving || !newItemName.trim()}
              className={styles.actionButton}
              type="button"
            >
              Add Item
            </button>
          </div>

          {/* Equip Item */}
          {inventoryItems.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Equip Item</h4>
              <div className={styles.fieldRow}>
                <select
                  value={equipItemId}
                  onChange={(e) => setEquipItemId(e.target.value)}
                  className={styles.select}
                  disabled={saving}
                >
                  <option value="">Select item...</option>
                  {inventoryItems
                    .filter((item) => !item.equipped_slot)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  value={equipSlot}
                  onChange={(e) => setEquipSlot(e.target.value)}
                  placeholder="Slot (e.g., right hand)"
                  className={styles.input}
                  disabled={saving}
                />
                <button
                  onClick={handleEquipItem}
                  disabled={saving || !equipItemId || !equipSlot.trim()}
                  className={styles.actionButton}
                  type="button"
                >
                  Equip
                </button>
              </div>
            </div>
          )}

          {/* Inventory List */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Inventory Items</h4>
            {inventoryItems.length === 0 ? (
              <div className={styles.empty}>Inventory is empty</div>
            ) : (
              <div className={styles.itemsList}>
                {inventoryItems.map((item) => (
                  <div key={item.id} className={styles.itemCard}>
                    <div className={styles.itemHeader}>
                      <strong>{item.name}</strong>
                      {item.equipped_slot && (
                        <span className={styles.equippedBadge}>Equipped: {item.equipped_slot}</span>
                      )}
                      {item.show_in_memory && <span className={styles.memoryBadge}>In Memory</span>}
                    </div>
                    {item.description && (
                      <div className={styles.itemDescription}>{item.description}</div>
                    )}
                    {Object.keys(item.descriptors).length > 0 && (
                      <div className={styles.itemDetails}>
                        {Object.entries(item.descriptors).map(([key, value]) => (
                          <span key={key} className={styles.tag}>
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={styles.itemActions}>
                      {item.equipped_slot ? (
                        <button
                          onClick={() => handleUnequipItem(item.id)}
                          className={styles.smallButton}
                          disabled={saving}
                          type="button"
                        >
                          Unequip
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleToggleMemory(item.id, item.show_in_memory)}
                        className={styles.smallButton}
                        disabled={saving}
                        type="button"
                      >
                        {item.show_in_memory ? 'Hide from Memory' : 'Show in Memory'}
                      </button>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className={styles.dangerButton}
                        disabled={saving}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmbodimentStateEditor;
