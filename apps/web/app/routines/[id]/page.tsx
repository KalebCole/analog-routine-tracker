'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  Printer,
  Camera,
  History,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { RoutineStatsDTO } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/stats-card';
import { useRoutine } from '@/hooks/use-routine';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface PageProps {
  params: { id: string };
}

export default function RoutinePage({ params }: PageProps) {
  const { id } = params;
  const { routine, isLoading, error } = useRoutine(id);
  const [stats, setStats] = useState<RoutineStatsDTO | null>(null);

  useEffect(() => {
    if (id) {
      api.getStats(id).then(setStats).catch(() => {
        // Stats are optional, don't show error
      });
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !routine) {
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
        <p className="text-muted-foreground">{error || 'This routine does not exist.'}</p>
        <Button asChild className="mt-4">
          <Link href="/">Back to Routines</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{routine.name}</h1>
          <p className="text-sm text-muted-foreground">
            Version {routine.version} • Modified {formatDate(routine.modifiedAt)}
          </p>
        </div>
        <Button variant="outline" size="icon" asChild>
          <Link href={`/routines/${id}/edit`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Button asChild className="h-auto py-4 flex-col gap-2">
          <Link href={`/routines/${id}/upload`}>
            <Camera className="h-5 w-5" />
            <span>Upload Photo</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
          <Link href={`/routines/${id}/print`}>
            <Printer className="h-5 w-5" />
            <span>Print Cards</span>
          </Link>
        </Button>
      </div>

      {/* Stats Card (compact) */}
      {stats && stats.totalCompletions > 0 && (
        <div className="mb-6">
          <StatsCard stats={stats} compact />
        </div>
      )}

      {/* Items List */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Items</span>
            <span className="text-sm font-normal text-muted-foreground">
              {routine.items.length} item{routine.items.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {routine.items
              .sort((a, b) => a.order - b.order)
              .map((item, index) => (
                <li key={item.id} className="py-3 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.type}
                      {item.type === 'number' && item.unit && ` (${item.unit})`}
                      {item.type === 'scale' && item.hasNotes && ' with notes'}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>

      {/* Secondary Actions */}
      <div className="space-y-3">
        <Button asChild variant="outline" className="w-full justify-start">
          <Link href={`/routines/${id}/history`}>
            <History className="h-4 w-4 mr-2" />
            View History
          </Link>
        </Button>
        <Button asChild variant="secondary" className="w-full justify-start">
          <Link href={`/routines/${id}/complete`}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Complete Digitally
          </Link>
        </Button>
      </div>
    </div>
  );
}
