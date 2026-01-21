'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import { RoutineStatsDTO } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { RoutineCard } from '@/components/routine-card';
import { useRoutines } from '@/hooks/use-routines';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

export default function HomePage() {
  const { routines, isLoading, error, refresh } = useRoutines();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [statsMap, setStatsMap] = useState<Map<string, RoutineStatsDTO>>(new Map());

  // Fetch stats for all routines
  useEffect(() => {
    if (routines.length === 0) return;

    const fetchStats = async () => {
      const newStats = new Map<string, RoutineStatsDTO>();

      // Fetch stats in parallel
      const results = await Promise.allSettled(
        routines.map(async (routine) => {
          const stats = await api.getStats(routine.id);
          return { id: routine.id, stats };
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          newStats.set(result.value.id, result.value.stats);
        }
      }

      setStatsMap(newStats);
    };

    fetchStats();
  }, [routines]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this routine? This cannot be undone.')) {
      return;
    }

    try {
      setDeleting(id);
      await api.deleteRoutine(id);
      toast({
        title: 'Routine deleted',
        description: 'The routine has been deleted.',
      });
      refresh();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete routine. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Routines</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button asChild>
            <Link href="/routines/new">
              <Plus className="h-4 w-4 mr-2" />
              New Routine
            </Link>
          </Button>
        </div>
      </header>

      {isLoading && routines.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={refresh}>
            Try Again
          </Button>
        </div>
      ) : routines.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No routines yet. Create your first routine to get started.
          </p>
          <Button asChild>
            <Link href="/routines/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Routine
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {routines.map((routine) => (
            <div key={routine.id} className={deleting === routine.id ? 'opacity-50' : ''}>
              <RoutineCard
                routine={routine}
                stats={statsMap.get(routine.id)}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
