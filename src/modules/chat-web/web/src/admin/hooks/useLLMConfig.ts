import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../utils/apiFetch';

export interface LLMConfig {
  model: string;
  model_endpoint_type: string;
  embedding: string;
  embedding_endpoint_type: string;
  embedding_dim: number;
  context_window: number;
  enable_sleeptime: boolean;
  system: string;
}

export function useLLMConfig(agentId: string | undefined) {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!agentId) {
      setConfig(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/llm-config`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load LLM config');
      }
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LLM config');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const loadModels = useCallback(async () => {
    if (!agentId) return;
    try {
      const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/models`);
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data.models || []);
      }
    } catch (err) {
      console.error('Failed to load available models:', err);
    }
  }, [agentId]);

  useEffect(() => {
    loadConfig();
    loadModels();
  }, [loadConfig, loadModels]);

  const updateConfig = async (updates: Partial<{
    model: string;
    embedding: string;
    context_window_limit: number;
    enable_sleeptime: boolean;
    system: string;
  }>) => {
    if (!agentId) throw new Error('No agent ID');

    const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update LLM config');
    }

    // Reload config to get updated values
    await loadConfig();
  };

  return {
    config,
    availableModels,
    loading,
    error,
    refetch: loadConfig,
    updateConfig,
  };
}
