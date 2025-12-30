import { Link } from 'react-router-dom';
import { useAgents } from '../hooks/useAgents';
import { useAvailableModules } from '../hooks/useModules';
import { useHealth } from '../hooks/useHealth';
import StatusBadge from '../components/StatusBadge';
import styles from './DashboardPage.module.scss';

const DashboardPage: React.FC = () => {
  const { agents, loading: agentsLoading } = useAgents();
  const { modules, loading: modulesLoading } = useAvailableModules();
  const { health, loading: healthLoading } = useHealth();

  const enabledAgents = agents.filter((a) => a.enabled);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>AGENTS</div>
          <div className={styles.statValue}>
            {agentsLoading ? '...' : agents.length}
          </div>
          <div className={styles.statMeta}>
            {!agentsLoading && `${enabledAgents.length} enabled`}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLabel}>MODULES</div>
          <div className={styles.statValue}>
            {modulesLoading ? '...' : modules.length}
          </div>
          <div className={styles.statMeta}>available</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLabel}>STATUS</div>
          <div className={styles.statValue}>
            {healthLoading ? (
              '...'
            ) : health ? (
              <StatusBadge status={health.status} />
            ) : (
              'Unknown'
            )}
          </div>
          <div className={styles.statMeta}>
            {health && `Uptime: ${formatUptime(health.uptime)}`}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Agents</h2>
          <Link to="/admin/agents" className={styles.viewAll}>
            View All &rarr;
          </Link>
        </div>
        <div className={styles.agentList}>
          {agentsLoading ? (
            <div className={styles.loading}>Loading agents...</div>
          ) : agents.length === 0 ? (
            <div className={styles.empty}>No agents configured</div>
          ) : (
            agents.slice(0, 5).map((agent) => (
              <Link
                key={agent.id}
                to={`/admin/agents/${agent.id}`}
                className={styles.agentRow}
              >
                <span className={styles.agentStatus}>
                  {agent.enabled ? '●' : '○'}
                </span>
                <span className={styles.agentId}>{agent.id}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actions}>
          <Link to="/admin/agents/new" className={styles.actionButton}>
            + Create Agent
          </Link>
          <Link to="/admin/templates" className={styles.actionButton}>
            Manage Templates
          </Link>
          <Link to="/admin/health" className={styles.actionButton}>
            System Health
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
