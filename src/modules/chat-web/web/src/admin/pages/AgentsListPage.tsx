import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAgents } from '../hooks/useAgents';
import AgentCard from '../components/AgentCard';
import styles from './AgentsListPage.module.scss';

type FilterType = 'all' | 'enabled' | 'disabled';

const AgentsListPage: React.FC = () => {
  const { agents, loading, error, toggleAgentEnabled, deleteAgent, refetch } = useAgents();
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLetta, setDeleteLetta] = useState(false);

  const filteredAgents = agents.filter((agent) => {
    if (filter === 'enabled' && !agent.enabled) return false;
    if (filter === 'disabled' && agent.enabled) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        agent.id.toLowerCase().includes(searchLower) ||
        agent.name.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const handleToggleEnabled = async (agentId: string) => {
    try {
      await toggleAgentEnabled(agentId);
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const handleDeleteClick = (agentId: string) => {
    setDeleteConfirm(agentId);
    setDeleteLetta(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteAgent(deleteConfirm, deleteLetta);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Agents</h1>
        <Link to="/admin/agents/new" className={styles.createButton}>
          + Create Agent
        </Link>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(['all', 'enabled', 'disabled'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`${styles.filterButton} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {loading ? (
        <div className={styles.loading}>Loading agents...</div>
      ) : error ? (
        <div className={styles.error}>
          {error}
          <button onClick={refetch} className={styles.retryButton}>
            Retry
          </button>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className={styles.empty}>
          {search || filter !== 'all' ? 'No agents match your filters' : 'No agents configured'}
        </div>
      ) : (
        <div className={styles.agentGrid}>
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggleEnabled={handleToggleEnabled}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Delete Agent</h3>
            <p className={styles.modalText}>
              Are you sure you want to delete <strong>{deleteConfirm}</strong>?
            </p>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={deleteLetta}
                onChange={(e) => setDeleteLetta(e.target.checked)}
              />
              Also delete associated Letta agent
            </label>
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button className={styles.deleteButton} onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentsListPage;
