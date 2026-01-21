'use client';

import { useState, useEffect, useCallback } from 'react';
import { RoutineDTO } from '@analog-routine-tracker/shared';
import { api, ApiError } from '@/lib/api';

interface UseRoutineResult {
  routine: RoutineDTO | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRoutine(id: string): UseRoutineResult {
  const [routine, setRoutine] = useState<RoutineDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutine = useCallback(async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getRoutine(id);
      setRoutine(data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 404) {
          setError('Routine not found');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to load routine');
      }
      setRoutine(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRoutine();
  }, [fetchRoutine]);

  return {
    routine,
    isLoading,
    error,
    refresh: fetchRoutine,
  };
}
