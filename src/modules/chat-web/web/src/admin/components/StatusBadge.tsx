import styles from './StatusBadge.module.scss';

export type StatusType = 'healthy' | 'degraded' | 'unhealthy' | 'enabled' | 'disabled' | 'tool' | 'service';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

const statusConfig: Record<StatusType, { color: string; defaultLabel: string }> = {
  healthy: { color: 'green', defaultLabel: 'Healthy' },
  degraded: { color: 'yellow', defaultLabel: 'Degraded' },
  unhealthy: { color: 'red', defaultLabel: 'Unhealthy' },
  enabled: { color: 'green', defaultLabel: 'Enabled' },
  disabled: { color: 'gray', defaultLabel: 'Disabled' },
  tool: { color: 'blue', defaultLabel: 'tool' },
  service: { color: 'purple', defaultLabel: 'service' },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const config = statusConfig[status];
  const displayLabel = label || config.defaultLabel;

  return (
    <span className={`${styles.badge} ${styles[config.color]}`}>
      <span className={styles.dot} />
      {displayLabel}
    </span>
  );
};

export default StatusBadge;
