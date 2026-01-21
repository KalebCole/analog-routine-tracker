'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, List, CalendarDays } from 'lucide-react';
import { CompletedRoutineDTO, RoutineStatsDTO } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { HistoryList } from '@/components/history-list';
import { StatsCard } from '@/components/stats-card';
import { CalendarView } from '@/components/calendar-view';
import { useRoutine } from '@/hooks/use-routine';
import { api, ApiError } from '@/lib/api';

interface PageProps {
  params: { id: string };
}

export default function HistoryRoutinePage({ params }: PageProps) {
  const { id } = params;
  const { routine, isLoading: routineLoading, error: routineError } = useRoutine(id);

  const [history, setHistory] = useState<CompletedRoutineDTO[]>([]);
  const [stats, setStats] = useState<RoutineStatsDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  // Compute completed dates and completion details for the calendar
  const { completedDates, completionDetails } = useMemo(() => {
    const dates: string[] = [];
    const details = new Map<string, { completed: number; total: number }>();

    for (const entry of history) {
      const dateKey = entry.date.split('T')[0]; // Get YYYY-MM-DD
      dates.push(dateKey);

      // Calculate how many items were completed vs total
      const completedCount = entry.values.filter((v) => {
        if (v.value === null || v.value === undefined) return false;
        if (typeof v.value === 'boolean') return v.value;
        if (typeof v.value === 'object' && 'value' in v.value) return v.value.value !== null;
        return true;
      }).length;

      details.set(dateKey, {
        completed: completedCount,
        total: entry.values.length,
      });
    }

    return { completedDates: dates, completionDetails: details };
  }, [history]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [historyResult, statsResult] = await Promise.all([
        api.getHistory(id, { pageSize: 50 }),
        api.getStats(id),
      ]);

      setHistory(historyResult.data);
      setStats(statsResult);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load history');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  if (routineLoading || isLoading) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (routineError || !routine) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <header className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Routine Not Found</h1>
        </header>
        <Button asChild>
          <Link href="/">Back to Routines</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/routines/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">History</h1>
          <p className="text-sm text-muted-foreground">{routine.name}</p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      {/* Stats Card */}
      {stats && (
        <div className="mb-6">
          <StatsCard stats={stats} />
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant={viewMode === 'calendar' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('calendar')}
          className="flex items-center gap-2"
        >
          <CalendarDays className="h-4 w-4" />
          Calendar
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('list')}
          className="flex items-center gap-2"
        >
          <List className="h-4 w-4" />
          List
        </Button>
      </div>

      {/* Content */}
      {error ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={fetchData}>
            Try Again
          </Button>
        </div>
      ) : viewMode === 'calendar' ? (
        <CalendarView
          completedDates={completedDates}
          completionDetails={completionDetails}
        />
      ) : (
        <HistoryList entries={history} items={routine.items} routineId={id} />
      )}
    </div>
  );
}
