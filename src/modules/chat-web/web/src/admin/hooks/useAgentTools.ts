/**
 * Hook for managing agent tool attachments via Letta
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../utils/apiFetch';

/**
 * Tool info from Letta
 */
export interface LettaTool {
  id: string;
  name: string;
  description?: string;
}

export function useAgentTools(agentId: string | undefined) {
  const [attachedTools, setAttachedTools] = useState<LettaTool[]>([]);
  const [availableTools, setAvailableTools] = useState<LettaTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    if (!agentId) {
      setAttachedTools([]);
      setAvailableTools([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/letta-tools`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load tools');
      }

      const data = await response.json();
      setAttachedTools(data.attached || []);
      setAvailableTools(data.available || []);
    } catch (err) {
      console.error('Failed to load tools:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const attachTool = async (toolId: string): Promise<void> => {
    if (!agentId) throw new Error('No agent ID');

    const response = await apiFetch(
      `/api/agents/${encodeURIComponent(agentId)}/letta-tools/${encodeURIComponent(toolId)}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to attach tool');
    }

    // Reload tools
    await loadTools();
  };

  const detachTool = async (toolId: string): Promise<void> => {
    if (!agentId) throw new Error('No agent ID');

    const response = await apiFetch(
      `/api/agents/${encodeURIComponent(agentId)}/letta-tools/${encodeURIComponent(toolId)}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to detach tool');
    }

    // Reload tools
    await loadTools();
  };

  // Tools that are available but not attached
  const unattachedTools = availableTools;

  return {
    attachedTools,
    availableTools,
    unattachedTools,
    loading,
    error,
    attachTool,
    detachTool,
    refetch: loadTools,
  };
}
