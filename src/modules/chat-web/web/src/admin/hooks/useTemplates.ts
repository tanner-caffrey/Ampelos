import { useState, useEffect, useCallback } from 'react';
import type { AgentTemplate, TemplateInfo } from '../types/admin';
import * as api from '../api/adminClient';

export function useAgentTemplates() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchAgentTemplates();
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const deleteTemplate = async (templateId: string) => {
    await api.deleteAgentTemplate(templateId);
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  return {
    templates,
    loading,
    error,
    refetch: loadTemplates,
    deleteTemplate,
  };
}

export function useContentTemplates() {
  const [memoryBlocks, setMemoryBlocks] = useState<TemplateInfo[]>([]);
  const [systemPrompts, setSystemPrompts] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [memoryData, promptData] = await Promise.all([
        api.fetchMemoryBlockTemplates(),
        api.fetchSystemPromptTemplates(),
      ]);
      setMemoryBlocks(memoryData.templates);
      setSystemPrompts(promptData.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const refreshTemplates = async () => {
    await api.refreshTemplates();
    await loadTemplates();
  };

  return {
    memoryBlocks,
    systemPrompts,
    loading,
    error,
    refetch: loadTemplates,
    refreshTemplates,
  };
}
