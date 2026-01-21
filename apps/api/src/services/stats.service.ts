import { query } from '../db/client';
import { RoutineStatsDTO } from '@analog-routine-tracker/shared';

interface CompletionDate {
  date: Date;
}

/**
 * Calculate the current streak (consecutive days ending today or yesterday)
 */
function calculateCurrentStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  // Sort dates descending (most recent first)
  const sortedDates = [...dates].sort((a, b) => b.getTime() - a.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if the most recent completion is today or yesterday
  const mostRecent = new Date(sortedDates[0]);
  mostRecent.setHours(0, 0, 0, 0);

  if (mostRecent.getTime() !== today.getTime() && mostRecent.getTime() !== yesterday.getTime()) {
    return 0; // Streak is broken
  }

  let streak = 1;
  let currentDate = mostRecent;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i]);
    prevDate.setHours(0, 0, 0, 0);

    const expectedPrevDate = new Date(currentDate);
    expectedPrevDate.setDate(expectedPrevDate.getDate() - 1);

    if (prevDate.getTime() === expectedPrevDate.getTime()) {
      streak++;
      currentDate = prevDate;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculate the longest streak in the completion history
 */
function calculateLongestStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  if (dates.length === 1) return 1;

  // Sort dates ascending
  const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());

  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i]);
    currentDate.setHours(0, 0, 0, 0);

    const prevDate = new Date(sortedDates[i - 1]);
    prevDate.setHours(0, 0, 0, 0);

    const expectedDate = new Date(prevDate);
    expectedDate.setDate(expectedDate.getDate() + 1);

    if (currentDate.getTime() === expectedDate.getTime()) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return longestStreak;
}

/**
 * Calculate completion rate for the last N days
 */
function calculateCompletionRate(dates: Date[], days: number = 30): number {
  if (days <= 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);

  const completionSet = new Set(
    dates.map((d) => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date.toISOString().split('T')[0];
    })
  );

  let completedDays = 0;
  const currentDate = new Date(startDate);

  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split('T')[0];
    if (completionSet.has(dateStr)) {
      completedDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return completedDays / days;
}

/**
 * Get statistics for a routine
 */
export async function getRoutineStats(routineId: string): Promise<RoutineStatsDTO | null> {
  // Verify routine exists
  const routineResult = await query('SELECT id FROM routines WHERE id = $1', [routineId]);
  if (routineResult.rows.length === 0) {
    return null;
  }

  // Get all completion dates
  const completionsResult = await query<CompletionDate>(
    `SELECT date FROM completed_routines
     WHERE routine_id = $1
     ORDER BY date DESC`,
    [routineId]
  );

  const dates = completionsResult.rows.map((row) => row.date);
  const totalCompletions = dates.length;

  // Get last completed date
  const lastCompletedAt = dates.length > 0 ? dates[0] : undefined;

  return {
    routineId,
    totalCompletions,
    currentStreak: calculateCurrentStreak(dates),
    longestStreak: calculateLongestStreak(dates),
    completionRate: calculateCompletionRate(dates, 30),
    lastCompletedAt: lastCompletedAt?.toISOString(),
  };
}
