import { useState, useEffect, useCallback } from 'react';
import type { AgentDefinition, CreateAgentRequest, UpdateAgentRequest } from '../types/admin';
import * as api from '../api/adminClient';

export function useAgents() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchAgents();
      setAgents(data.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const createAgent = async (data: CreateAgentRequest) => {
    const result = await api.createAgent(data);
    setAgents((prev) => [...prev, result.agent]);
    return result.agent;
  };

  const updateAgent = async (agentId: string, data: UpdateAgentRequest) => {
    const result = await api.updateAgent(agentId, data);
    setAgents((prev) => prev.map((a) => (a.id === agentId ? result.agent : a)));
    return result.agent;
  };

  const deleteAgent = async (agentId: string, deleteLetta = false) => {
    await api.deleteAgent(agentId, deleteLetta);
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
  };

  const toggleAgentEnabled = async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;

    // Optimistic update
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, enabled: !a.enabled } : a)));

    try {
      if (agent.enabled) {
        await api.disableAgent(agentId);
      } else {
        await api.enableAgent(agentId);
      }
    } catch (err) {
      // Rollback on error
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, enabled: agent.enabled } : a)));
      throw err;
    }
  };

  return {
    agents,
    loading,
    error,
    refetch: loadAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleAgentEnabled,
  };
}

export function useAgent(agentId: string | undefined) {
  const [agent, setAgent] = useState<AgentDefinition | null>(null);
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [initializedModules, setInitializedModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgent = useCallback(async () => {
    if (!agentId) {
      setAgent(null);
      setState(null);
      setInitializedModules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchAgent(agentId);
      setAgent(data.agent);
      setState(data.state ?? null);
      setInitializedModules(data.initializedModules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  const updateAgent = async (data: UpdateAgentRequest) => {
    if (!agentId) throw new Error('No agent ID');
    const result = await api.updateAgent(agentId, data);
    setAgent(result.agent);
    return result.agent;
  };

  const toggleEnabled = async () => {
    if (!agent) return;

    // Optimistic update
    setAgent((prev) => (prev ? { ...prev, enabled: !prev.enabled } : null));

    try {
      if (agent.enabled) {
        const result = await api.disableAgent(agentId!);
        setAgent(result.agent);
      } else {
        const result = await api.enableAgent(agentId!);
        setAgent(result.agent);
      }
    } catch (err) {
      // Rollback
      setAgent((prev) => (prev ? { ...prev, enabled: agent.enabled } : null));
      throw err;
    }
  };

  return {
    agent,
    state,
    initializedModules,
    loading,
    error,
    refetch: loadAgent,
    updateAgent,
    toggleEnabled,
  };
}
