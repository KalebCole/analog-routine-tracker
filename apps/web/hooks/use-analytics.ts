'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

export function useAnalyticsSummary(routineId: string) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await api.getAnalyticsSummary(routineId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [routineId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, isLoading, error, refresh: fetch };
}

export function useAnalyticsHeatmap(routineId: string, months: number = 3) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.getAnalyticsHeatmap(routineId, months).then(setData).catch(() => {}).finally(() => setIsLoading(false));
  }, [routineId, months]);

  return { data, isLoading };
}

export function useAnalyticsItems(routineId: string, days: number = 30) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.getAnalyticsItems(routineId, days).then(setData).catch(() => {}).finally(() => setIsLoading(false));
  }, [routineId, days]);

  return { data, isLoading };
}

export function useAnalyticsTrends(routineId: string, weeks: number = 12) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.getAnalyticsTrends(routineId, weeks).then(setData).catch(() => {}).finally(() => setIsLoading(false));
  }, [routineId, weeks]);

  return { data, isLoading };
}
