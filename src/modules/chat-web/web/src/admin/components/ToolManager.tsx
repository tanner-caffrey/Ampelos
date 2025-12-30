/**
 * Tool Manager Component
 * Displays and manages tools attached to an agent via Letta
 * Using sacred computer design system
 */

import React, { useState, useMemo } from 'react';
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
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [toolFilter, setToolFilter] = useState<string>('');

  // Filter unattached tools based on search input
  const filteredUnattachedTools = useMemo(() => {
    if (!toolFilter.trim()) return unattachedTools;
    const search = toolFilter.toLowerCase();
    return unattachedTools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search) ||
        (tool.description && tool.description.toLowerCase().includes(search))
    );
  }, [unattachedTools, toolFilter]);

  const handleAttach = async () => {
    if (!selectedToolId) return;

    setAttaching(true);
    setActionError(null);
    try {
      await onAttachTool(selectedToolId);
      setSelectedToolId('');
      setToolFilter('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to attach tool');
    } finally {
      setAttaching(false);
    }
  };

  const toggleToolExpand = (toolId: string) => {
    setExpandedTool(expandedTool === toolId ? null : toolId);
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
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Filter tools..."
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            disabled={attaching}
          />
          <div className={styles.selectRow}>
            <select
              className={styles.select}
              value={selectedToolId}
              onChange={(e) => setSelectedToolId(e.target.value)}
              disabled={attaching}
            >
              <option value="">Select a tool to attach...</option>
              {filteredUnattachedTools.map((tool) => (
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
          {toolFilter && (
            <span className={styles.filterHint}>
              Showing {filteredUnattachedTools.length} of {unattachedTools.length} tools
            </span>
          )}
        </div>
      </Card>

      {/* Attached Tools List */}
      <Card title={`Attached Tools (${attachedTools.length})`}>
        {attachedTools.length === 0 ? (
          <div className={styles.empty}>No tools attached to this agent</div>
        ) : (
          <div className={styles.toolList}>
            {attachedTools.map((tool) => {
              const isExpanded = expandedTool === tool.id;
              return (
                <div key={tool.id} className={styles.toolItem}>
                  <div
                    className={styles.toolHeader}
                    onClick={() => toggleToolExpand(tool.id)}
                  >
                    <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                    <span className={styles.toolName}>{tool.name}</span>
                    <Badge>{tool.id.slice(0, 8)}...</Badge>
                  </div>
                  {isExpanded && (
                    <div className={styles.toolDetails}>
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
                  )}
                </div>
              );
            })}
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
