import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAgentTemplates, useContentTemplates } from '../hooks/useTemplates';
import styles from './TemplatesPage.module.scss';

const TemplatesPage: React.FC = () => {
  const { templates: agentTemplates, loading: agentsLoading, deleteTemplate } = useAgentTemplates();
  const { memoryBlocks, systemPrompts, loading: contentLoading, refreshTemplates } = useContentTemplates();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshTemplates();
    } catch (err) {
      console.error('Failed to refresh templates:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm(`Delete template "${templateId}"?`)) return;
    try {
      await deleteTemplate(templateId);
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Templates</h1>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Agent Templates</h2>
        </div>

        {agentsLoading ? (
          <div className={styles.loading}>Loading templates...</div>
        ) : agentTemplates.length === 0 ? (
          <div className={styles.empty}>
            No agent templates configured.
          </div>
        ) : (
          <div className={styles.templateList}>
            {agentTemplates.map((template) => (
              <div key={template.id} className={styles.templateCard}>
                <div className={styles.templateHeader}>
                  <div className={styles.templateInfo}>
                    <span className={styles.templateName}>{template.name}</span>
                    <span className={styles.templateId}>{template.id}</span>
                  </div>
                  <div className={styles.templateActions}>
                    <Link
                      to={`/admin/agents/new?template=${template.id}`}
                      className={styles.useButton}
                    >
                      Use
                    </Link>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {template.description && (
                  <div className={styles.templateDescription}>{template.description}</div>
                )}
                <div className={styles.templateMeta}>
                  <span>
                    Modules: {template.modules ? Object.keys(template.modules).join(', ') || 'None' : 'None'}
                  </span>
                  <span>Variables: {template.variables.length}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Memory Block Templates</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={styles.refreshButton}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {contentLoading ? (
          <div className={styles.loading}>Loading templates...</div>
        ) : memoryBlocks.length === 0 ? (
          <div className={styles.empty}>No memory block templates found.</div>
        ) : (
          <div className={styles.contentTemplateList}>
            {memoryBlocks.map((template) => (
              <div
                key={template.name}
                className={styles.contentTemplate}
                onClick={() =>
                  setExpandedTemplate(
                    expandedTemplate === `memory-${template.name}` ? null : `memory-${template.name}`
                  )
                }
              >
                <div className={styles.contentTemplateHeader}>
                  <span className={styles.contentTemplateName}>{template.name}</span>
                  <span className={styles.expandIcon}>
                    {expandedTemplate === `memory-${template.name}` ? '▼' : '▶'}
                  </span>
                </div>
                {expandedTemplate === `memory-${template.name}` && (
                  <div className={styles.contentTemplateBody}>
                    <div className={styles.templatePath}>{template.path}</div>
                    {template.variables.length > 0 && (
                      <div className={styles.variables}>
                        Variables:{' '}
                        {template.variables.map((v) => (
                          <code key={v} className={styles.variable}>
                            {`{{${v}}}`}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>System Prompt Templates</h2>
        </div>

        {contentLoading ? (
          <div className={styles.loading}>Loading templates...</div>
        ) : systemPrompts.length === 0 ? (
          <div className={styles.empty}>No system prompt templates found.</div>
        ) : (
          <div className={styles.contentTemplateList}>
            {systemPrompts.map((template) => (
              <div
                key={template.name}
                className={styles.contentTemplate}
                onClick={() =>
                  setExpandedTemplate(
                    expandedTemplate === `prompt-${template.name}` ? null : `prompt-${template.name}`
                  )
                }
              >
                <div className={styles.contentTemplateHeader}>
                  <span className={styles.contentTemplateName}>{template.name}</span>
                  <span className={styles.expandIcon}>
                    {expandedTemplate === `prompt-${template.name}` ? '▼' : '▶'}
                  </span>
                </div>
                {expandedTemplate === `prompt-${template.name}` && (
                  <div className={styles.contentTemplateBody}>
                    <div className={styles.templatePath}>{template.path}</div>
                    {template.variables.length > 0 && (
                      <div className={styles.variables}>
                        Variables:{' '}
                        {template.variables.map((v) => (
                          <code key={v} className={styles.variable}>
                            {`{{${v}}}`}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplatesPage;
