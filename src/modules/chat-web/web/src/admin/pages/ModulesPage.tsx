import { useState } from 'react';
import { useAvailableModules, useModuleSchema } from '../hooks/useModules';
import StatusBadge from '../components/StatusBadge';
import styles from './ModulesPage.module.scss';

const ModulesPage: React.FC = () => {
  const { modules, loading, error, refetch } = useAvailableModules();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const { schema, loading: schemaLoading } = useModuleSchema(expandedModule);

  const toggleExpanded = (moduleName: string) => {
    setExpandedModule(expandedModule === moduleName ? null : moduleName);
  };

  if (loading) {
    return <div className={styles.loading}>Loading modules...</div>;
  }

  if (error) {
    return (
      <div className={styles.error}>
        {error}
        <button onClick={refetch} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Available Modules</h1>
      <p className={styles.description}>
        These modules can be added to agents to extend their capabilities.
      </p>

      <div className={styles.moduleList}>
        {modules.map((mod) => (
          <div key={mod.name} className={styles.moduleCard}>
            <div
              className={styles.moduleHeader}
              onClick={() => toggleExpanded(mod.name)}
            >
              <div className={styles.moduleInfo}>
                <span className={styles.moduleName}>{mod.name}</span>
                <span className={styles.moduleVersion}>v{mod.version}</span>
              </div>
              <div className={styles.moduleMeta}>
                {mod.provides.map((type) => (
                  <StatusBadge key={type} status={type} />
                ))}
                <span className={styles.expandIcon}>
                  {expandedModule === mod.name ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {mod.description && (
              <div className={styles.moduleDescription}>{mod.description}</div>
            )}

            {mod.dependencies && mod.dependencies.length > 0 && (
              <div className={styles.dependencies}>
                <span className={styles.dependencyLabel}>Dependencies:</span>
                {mod.dependencies.map((dep) => (
                  <span key={dep} className={styles.dependency}>
                    {dep}
                  </span>
                ))}
              </div>
            )}

            {expandedModule === mod.name && (
              <div className={styles.moduleBody}>
                <h4 className={styles.schemaTitle}>Configuration Schema</h4>
                {schemaLoading ? (
                  <div className={styles.schemaLoading}>Loading schema...</div>
                ) : schema ? (
                  <pre className={styles.schemaCode}>
                    {JSON.stringify(schema, null, 2)}
                  </pre>
                ) : (
                  <div className={styles.noSchema}>No schema available</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModulesPage;
