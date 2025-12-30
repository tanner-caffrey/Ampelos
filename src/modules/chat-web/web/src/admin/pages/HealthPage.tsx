import { useHealth } from '../hooks/useHealth';
import StatusBadge from '../components/StatusBadge';
import styles from './HealthPage.module.scss';

const HealthPage: React.FC = () => {
  const { health, loading, error, refetch } = useHealth();

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>System Health</h1>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Status</h2>
          <button onClick={refetch} className={styles.refreshButton}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading health status...</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : health ? (
          <div className={styles.card}>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>System Status</span>
              <StatusBadge status={health.status} />
            </div>

            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Version</span>
                <span className={styles.statValue}>{health.version}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Uptime</span>
                <span className={styles.statValue}>{formatUptime(health.uptime)}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Schema Version</span>
                <span className={styles.statValue}>{health.schemaVersion}</span>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.agentStats}>
              <h3 className={styles.subTitle}>Agents</h3>
              <div className={styles.statsGrid}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Total</span>
                  <span className={styles.statValue}>{health.agents.total}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Enabled</span>
                  <span className={styles.statValue}>{health.agents.enabled}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Disabled</span>
                  <span className={styles.statValue}>
                    {health.agents.total - health.agents.enabled}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default HealthPage;
