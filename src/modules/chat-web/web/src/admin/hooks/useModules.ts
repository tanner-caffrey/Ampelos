import { useState, useEffect, useCallback } from 'react';
import type { AvailableModule } from '../types/admin';
import * as api from '../api/adminClient';

export function useAvailableModules() {
  const [modules, setModules] = useState<AvailableModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchAvailableModules();
      setModules(data.modules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  return {
    modules,
    loading,
    error,
    refetch: loadModules,
  };
}

export function useModuleSchema(moduleName: string | null) {
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSchema = useCallback(async () => {
    if (!moduleName) {
      setSchema(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchModuleSchema(moduleName);
      setSchema(data.schema);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schema');
    } finally {
      setLoading(false);
    }
  }, [moduleName]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  return {
    schema,
    loading,
    error,
    refetch: loadSchema,
  };
}
