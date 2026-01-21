'use client';

import { useState, useEffect, useCallback } from 'react';
import { RoutineDTO } from '@analog-routine-tracker/shared';
import { api, ApiError } from '@/lib/api';

interface UseRoutinesResult {
  routines: RoutineDTO[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRoutines(): UseRoutinesResult {
  const [routines, setRoutines] = useState<RoutineDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutines = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getRoutines();
      setRoutines(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load routines');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  return {
    routines,
    isLoading,
    error,
    refresh: fetchRoutines,
  };
}
