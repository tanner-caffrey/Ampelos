import { Link } from 'react-router-dom';
import type { AgentDefinition } from '../types/admin';
import StatusBadge from './StatusBadge';
import styles from './AgentCard.module.scss';

interface AgentCardProps {
  agent: AgentDefinition;
  onToggleEnabled?: (agentId: string, enabled: boolean) => void;
  onDelete?: (agentId: string) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onToggleEnabled, onDelete }) => {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Link to={`/admin/agents/${agent.id}`} className={styles.agentId}>
            {agent.id}
          </Link>
          <StatusBadge status={agent.enabled ? 'enabled' : 'disabled'} />
        </div>
        <div className={styles.agentName}>{agent.name}</div>
      </div>

      <div className={styles.body}>
        <div className={styles.info}>
          <span className={styles.label}>Modules:</span>
          <span className={styles.value}>
            {agent.modules.length > 0 ? agent.modules.join(', ') : 'None'}
          </span>
        </div>
        <div className={styles.info}>
          <span className={styles.label}>Count:</span>
          <span className={styles.value}>
            {agent.modules.length} module{agent.modules.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={styles.info}>
          <span className={styles.label}>Created:</span>
          <span className={styles.value}>{formatDate(agent.created_at)}</span>
        </div>
      </div>

      <div className={styles.actions}>
        {onToggleEnabled && (
          <button
            className={`${styles.button} ${agent.enabled ? styles.warning : styles.success}`}
            onClick={() => onToggleEnabled(agent.id, !agent.enabled)}
          >
            {agent.enabled ? 'Disable' : 'Enable'}
          </button>
        )}
        <Link to={`/admin/agents/${agent.id}`} className={styles.button}>
          Edit
        </Link>
        {onDelete && (
          <button className={`${styles.button} ${styles.danger}`} onClick={() => onDelete(agent.id)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

export default AgentCard;
