/**
 * Tool Manager Component
 * Displays and manages tools attached to an agent via Letta
 * Using sacred computer design system
 */

import React, { useState } from 'react';
import type { LettaTool } from '../hooks/useAgentTools';
import Card from '../../sacred/components/Card';
import Button from '../../sacred/components/Button';
import Badge from '../../sacred/components/Badge';
import styles from './ToolManager.module.scss';

interface ToolManagerProps {
  attachedTools: LettaTool[];
  unattachedTools: LettaTool[];
  loading: boolean;
  error: string | null;
  onAttachTool: (toolId: string) => Promise<void>;
  onDetachTool: (toolId: string) => Promise<void>;
}

export default function ToolManager({
  attachedTools,
  unattachedTools,
  loading,
  error,
  onAttachTool,
  onDetachTool,
}: ToolManagerProps) {
  const [selectedToolId, setSelectedToolId] = useState<string>('');
  const [attaching, setAttaching] = useState(false);
  const [detaching, setDetaching] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAttach = async () => {
    if (!selectedToolId) return;

    setAttaching(true);
    setActionError(null);
    try {
      await onAttachTool(selectedToolId);
      setSelectedToolId('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to attach tool');
    } finally {
      setAttaching(false);
    }
  };

  const handleDetach = async (toolId: string) => {
    setDetaching(toolId);
    setActionError(null);
    try {
      await onDetachTool(toolId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to detach tool');
    } finally {
      setDetaching(null);
    }
  };

  if (loading) {
    return (
      <Card title="Tools">
        <div className={styles.loading}>Loading tools...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Tools">
        <div className={styles.error}>{error}</div>
      </Card>
    );
  }

  return (
    <div className={styles.container}>
      {actionError && <div className={styles.actionError}>{actionError}</div>}

      {/* Add Tool Form */}
      <Card title="Attach Tool">
        <div className={styles.addToolForm}>
          <select
            className={styles.select}
            value={selectedToolId}
            onChange={(e) => setSelectedToolId(e.target.value)}
            disabled={attaching}
          >
            <option value="">Select a tool to attach...</option>
            {unattachedTools.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.name}
              </option>
            ))}
          </select>
          <Button
            onClick={handleAttach}
            isDisabled={!selectedToolId || attaching}
          >
            {attaching ? 'Attaching...' : 'Attach'}
          </Button>
        </div>
      </Card>

      {/* Attached Tools List */}
      <Card title={`Attached Tools (${attachedTools.length})`}>
        {attachedTools.length === 0 ? (
          <div className={styles.empty}>No tools attached to this agent</div>
        ) : (
          <div className={styles.toolList}>
            {attachedTools.map((tool) => (
              <div key={tool.id} className={styles.toolCard}>
                <div className={styles.toolHeader}>
                  <span className={styles.toolName}>{tool.name}</span>
                  <Badge>{tool.id.slice(0, 8)}...</Badge>
                </div>
                {tool.description && (
                  <p className={styles.toolDescription}>{tool.description}</p>
                )}
                <div className={styles.toolActions}>
                  <Button
                    theme="SECONDARY"
                    onClick={() => handleDetach(tool.id)}
                    isDisabled={detaching === tool.id}
                  >
                    {detaching === tool.id ? 'Detaching...' : 'Detach'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Summary */}
      <div className={styles.summary}>
        <span className={styles.summaryText}>
          {attachedTools.length} tool{attachedTools.length !== 1 ? 's' : ''} attached
          {unattachedTools.length > 0 && ` | ${unattachedTools.length} available`}
        </span>
      </div>
    </div>
  );
}
