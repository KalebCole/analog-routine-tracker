'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasCompletion: boolean;
  completionRate?: number; // 0-1 for items completed vs total items
}

interface CalendarViewProps {
  completedDates: string[]; // ISO date strings (YYYY-MM-DD)
  completionDetails?: Map<string, { completed: number; total: number }>;
  onDateClick?: (date: string) => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function CalendarView({
  completedDates,
  completionDetails,
  onDateClick,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completedSet = useMemo(
    () => new Set(completedDates),
    [completedDates]
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const days = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const daysInPrevMonth = getDaysInMonth(year, month - 1);

    const calendarDays: CalendarDay[] = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, daysInPrevMonth - i);
      const dateKey = formatDateKey(date);
      calendarDays.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        hasCompletion: completedSet.has(dateKey),
        completionRate: completionDetails?.get(dateKey)?.completed
          ? completionDetails.get(dateKey)!.completed / completionDetails.get(dateKey)!.total
          : undefined,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      date.setHours(0, 0, 0, 0);
      const dateKey = formatDateKey(date);
      calendarDays.push({
        date,
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
        hasCompletion: completedSet.has(dateKey),
        completionRate: completionDetails?.get(dateKey)?.completed
          ? completionDetails.get(dateKey)!.completed / completionDetails.get(dateKey)!.total
          : undefined,
      });
    }

    // Next month days to fill the grid
    const remainingDays = 42 - calendarDays.length; // 6 rows * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      const dateKey = formatDateKey(date);
      calendarDays.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        hasCompletion: completedSet.has(dateKey),
        completionRate: completionDetails?.get(dateKey)?.completed
          ? completionDetails.get(dateKey)!.completed / completionDetails.get(dateKey)!.total
          : undefined,
      });
    }

    return calendarDays;
  }, [year, month, today, completedSet, completionDetails]);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthYearLabel = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-background rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-medium">{monthYearLabel}</span>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          const dateKey = formatDateKey(day.date);
          const isClickable = day.hasCompletion && onDateClick;

          // Determine background color based on completion
          let bgClass = '';
          if (day.hasCompletion) {
            const rate = day.completionRate ?? 1;
            if (rate >= 0.8) {
              bgClass = 'bg-green-500';
            } else if (rate >= 0.5) {
              bgClass = 'bg-yellow-500';
            } else {
              bgClass = 'bg-red-400';
            }
          }

          return (
            <button
              key={index}
              onClick={() => isClickable && onDateClick(dateKey)}
              disabled={!isClickable}
              className={`
                aspect-square p-1 text-sm rounded-md relative
                ${day.isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50'}
                ${day.isToday ? 'ring-2 ring-primary ring-offset-2' : ''}
                ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                ${bgClass || (day.isCurrentMonth ? 'hover:bg-muted' : '')}
                ${day.hasCompletion ? 'text-white font-medium' : ''}
              `}
            >
              <span className="flex items-center justify-center h-full">
                {day.date.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500" />
          <span>Partial</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-muted border" />
          <span>No entry</span>
        </div>
      </div>
    </div>
  );
}
