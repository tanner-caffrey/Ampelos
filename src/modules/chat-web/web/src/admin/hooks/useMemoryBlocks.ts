import { useState, useEffect, useCallback } from 'react';
import type { MemoryBlockDetail, CreateMemoryBlockRequest } from '../types/admin';
import * as api from '../api/adminClient';

export function useMemoryBlocks(agentId: string | undefined) {
  const [blocks, setBlocks] = useState<MemoryBlockDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    if (!agentId) {
      setBlocks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchMemoryBlocks(agentId);
      setBlocks(data.blocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory blocks');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const createBlock = async (data: CreateMemoryBlockRequest) => {
    if (!agentId) throw new Error('No agent ID');
    const result = await api.createMemoryBlock(agentId, data);
    await loadBlocks();
    return result.blockId;
  };

  const updateBlock = async (blockLabel: string, value: string) => {
    if (!agentId) throw new Error('No agent ID');
    await api.updateMemoryBlock(agentId, blockLabel, value);
    // Update local state
    setBlocks((prev) =>
      prev.map((b) => (b.label === blockLabel ? { ...b, value } : b))
    );
  };

  const deleteBlock = async (blockId: string) => {
    if (!agentId) throw new Error('No agent ID');
    await api.deleteMemoryBlock(agentId, blockId);
    await loadBlocks();
  };

  return {
    blocks,
    loading,
    error,
    refetch: loadBlocks,
    createBlock,
    updateBlock,
    deleteBlock,
  };
}
