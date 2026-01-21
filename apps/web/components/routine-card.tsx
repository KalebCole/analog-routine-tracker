'use client';

import Link from 'next/link';
import { RoutineDTO, RoutineStatsDTO } from '@analog-routine-tracker/shared';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MiniStats } from '@/components/stats-card';
import { formatDate } from '@/lib/utils';
import {
  MoreVertical,
  Pencil,
  Trash2,
  Printer,
  Camera,
  History,
  CheckCircle2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RoutineCardProps {
  routine: RoutineDTO;
  stats?: RoutineStatsDTO;
  onDelete?: (id: string) => void;
}

export function RoutineCard({ routine, stats, onDelete }: RoutineCardProps) {
  const itemCount = routine.items.length;
  const itemTypes = new Set(routine.items.map(i => i.type));

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <Link href={`/routines/${routine.id}`} className="flex-1">
            <CardTitle className="text-lg hover:text-primary transition-colors">
              {routine.name}
            </CardTitle>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/routines/${routine.id}`}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Complete
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/routines/${routine.id}/upload`}>
                  <Camera className="mr-2 h-4 w-4" />
                  Upload Photo
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/routines/${routine.id}/print`}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Cards
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/routines/${routine.id}/history`}>
                  <History className="mr-2 h-4 w-4" />
                  View History
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/routines/${routine.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete?.(routine.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <Link href={`/routines/${routine.id}`}>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
            <span className="flex gap-1">
              {Array.from(itemTypes).map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-secondary"
                >
                  {type}
                </span>
              ))}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              Modified {formatDate(routine.modifiedAt)}
            </span>
            {stats && stats.totalCompletions > 0 && (
              <MiniStats
                totalCompletions={stats.totalCompletions}
                currentStreak={stats.currentStreak}
              />
            )}
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
