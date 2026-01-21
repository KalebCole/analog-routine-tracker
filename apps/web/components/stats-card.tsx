'use client';

import { RoutineStatsDTO } from '@analog-routine-tracker/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StreakDisplay } from '@/components/streak-display';
import { Flame, Calendar, CheckCircle, TrendingUp } from 'lucide-react';

interface StatsCardProps {
  stats: RoutineStatsDTO;
  compact?: boolean;
}

export function StatsCard({ stats, compact = false }: StatsCardProps) {
  const completionPercent = Math.round(stats.completionRate * 100);

  if (compact) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <StreakDisplay
              currentStreak={stats.currentStreak}
              longestStreak={stats.longestStreak}
              size="sm"
            />
            <div className="text-right">
              <p className="text-lg font-bold">{completionPercent}%</p>
              <p className="text-xs text-muted-foreground">30-day rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Streak Section */}
        <div className="mb-6">
          <StreakDisplay
            currentStreak={stats.currentStreak}
            longestStreak={stats.longestStreak}
            size="lg"
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center mb-1">
              <Flame className="h-4 w-4 text-orange-500" />
            </div>
            <p className="text-xl font-bold">{stats.longestStreak}</p>
            <p className="text-xs text-muted-foreground">Best Streak</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-xl font-bold">{stats.totalCompletions}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center mb-1">
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xl font-bold">{completionPercent}%</p>
            <p className="text-xs text-muted-foreground">30-day</p>
          </div>
        </div>

        {/* Completion Rate Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">30-day completion rate</span>
            <span className="font-medium">{completionPercent}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                completionPercent >= 80
                  ? 'bg-green-500'
                  : completionPercent >= 50
                  ? 'bg-yellow-500'
                  : 'bg-red-400'
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        {/* Last Completed */}
        {stats.lastCompletedAt && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Last completed:{' '}
            {new Date(stats.lastCompletedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Mini stats display for routine cards
 */
interface MiniStatsProps {
  totalCompletions: number;
  currentStreak: number;
}

export function MiniStats({ totalCompletions, currentStreak }: MiniStatsProps) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-1">
        <CheckCircle className="h-3.5 w-3.5" />
        <span>{totalCompletions}</span>
      </div>
      {currentStreak > 0 && (
        <div className="flex items-center gap-1 text-orange-500">
          <Flame className="h-3.5 w-3.5" />
          <span>{currentStreak}</span>
        </div>
      )}
    </div>
  );
}
