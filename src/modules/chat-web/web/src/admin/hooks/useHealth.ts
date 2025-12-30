import { useState, useEffect, useCallback, useRef } from 'react';
import type { HealthStatus } from '../types/admin';
import * as api from '../api/adminClient';

export function useHealth(pollInterval = 30000) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const data = await api.fetchHealth();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();

    if (pollInterval > 0) {
      intervalRef.current = window.setInterval(loadHealth, pollInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadHealth, pollInterval]);

  return {
    health,
    loading,
    error,
    refetch: loadHealth,
  };
}
