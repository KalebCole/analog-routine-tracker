'use client';

import { Flame, Trophy, TrendingUp } from 'lucide-react';

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  showLongest?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StreakDisplay({
  currentStreak,
  longestStreak,
  showLongest = true,
  size = 'md',
}: StreakDisplayProps) {
  const sizeClasses = {
    sm: {
      container: 'gap-2',
      icon: 'h-4 w-4',
      number: 'text-lg',
      label: 'text-xs',
    },
    md: {
      container: 'gap-3',
      icon: 'h-5 w-5',
      number: 'text-2xl',
      label: 'text-sm',
    },
    lg: {
      container: 'gap-4',
      icon: 'h-6 w-6',
      number: 'text-3xl',
      label: 'text-base',
    },
  };

  const classes = sizeClasses[size];

  // Determine flame color based on streak length
  const getFlameColor = (streak: number): string => {
    if (streak >= 30) return 'text-orange-500';
    if (streak >= 14) return 'text-yellow-500';
    if (streak >= 7) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const isNewRecord = currentStreak >= longestStreak && currentStreak > 0;

  return (
    <div className={`flex items-center ${classes.container}`}>
      {/* Current Streak */}
      <div className="flex items-center gap-2">
        <Flame className={`${classes.icon} ${getFlameColor(currentStreak)}`} />
        <div>
          <p className={`${classes.number} font-bold leading-none`}>
            {currentStreak}
          </p>
          <p className={`${classes.label} text-muted-foreground`}>
            day{currentStreak !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* New Record Badge */}
      {isNewRecord && currentStreak > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
          <Trophy className="h-3 w-3" />
          <span>New record!</span>
        </div>
      )}

      {/* Longest Streak */}
      {showLongest && !isNewRecord && longestStreak > currentStreak && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp className={classes.icon} />
          <span className={classes.label}>
            Best: {longestStreak} day{longestStreak !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact streak badge for use in cards/lists
 */
interface StreakBadgeProps {
  streak: number;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  if (streak === 0) return null;

  const getColor = (s: number) => {
    if (s >= 30) return 'bg-orange-100 text-orange-700';
    if (s >= 14) return 'bg-yellow-100 text-yellow-700';
    if (s >= 7) return 'bg-red-100 text-red-700';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getColor(
        streak
      )}`}
    >
      <Flame className="h-3 w-3" />
      <span>{streak}</span>
    </div>
  );
}
