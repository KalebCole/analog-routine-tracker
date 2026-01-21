'use client';

import Link from 'next/link';
import { CompletedRoutineDTO, Item } from '@analog-routine-tracker/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { Camera, Pencil, ChevronRight, CheckCircle, XCircle } from 'lucide-react';

interface HistoryListProps {
  entries: CompletedRoutineDTO[];
  items: Item[];
  routineId: string;
}

export function HistoryList({ entries, items, routineId }: HistoryListProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No completion entries yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <HistoryEntry
          key={entry.id}
          entry={entry}
          items={items}
          routineId={routineId}
        />
      ))}
    </div>
  );
}

interface HistoryEntryProps {
  entry: CompletedRoutineDTO;
  items: Item[];
  routineId: string;
}

function HistoryEntry({ entry, items, routineId }: HistoryEntryProps) {
  // Calculate completion summary
  const completedItems = entry.values.filter((v) => {
    if (typeof v.value === 'boolean') return v.value;
    if (v.value === null) return false;
    if (typeof v.value === 'object' && 'value' in v.value) return v.value.value > 0;
    return true;
  }).length;

  const totalItems = items.length;
  const completionPercent = Math.round((completedItems / totalItems) * 100);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{formatDate(entry.date)}</span>
              {entry.source === 'analog' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-secondary">
                  <Camera className="h-3 w-3 mr-1" />
                  Photo
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                {completionPercent >= 80 ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-yellow-500" />
                )}
                {completedItems}/{totalItems} items ({completionPercent}%)
              </span>
              {entry.routineVersion !== items.length && (
                <span className="text-xs">v{entry.routineVersion}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/routines/${routineId}/history/${entry.date}/edit`}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/routines/${routineId}/history/${entry.date}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
