'use client';

interface HeatmapDay {
  date: string;
  completionPct: number;
  completed: boolean;
}

interface CalendarHeatmapProps {
  days: HeatmapDay[];
}

function getColor(pct: number): string {
  if (pct === 0) return 'bg-secondary';
  if (pct < 25) return 'bg-green-200 dark:bg-green-900';
  if (pct < 50) return 'bg-green-300 dark:bg-green-700';
  if (pct < 75) return 'bg-green-400 dark:bg-green-600';
  return 'bg-green-500 dark:bg-green-500';
}

export function CalendarHeatmap({ days }: CalendarHeatmapProps) {
  // Group by week (columns) like GitHub contributions
  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];

  if (days.length > 0) {
    const firstDay = new Date(days[0].date + 'T12:00:00');
    // Pad start to align with Sunday
    const startDow = firstDay.getDay();
    for (let i = 0; i < startDow; i++) {
      currentWeek.push({ date: '', completionPct: -1, completed: false });
    }
  }

  for (const day of days) {
    const d = new Date(day.date + 'T12:00:00');
    if (d.getDay() === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(day);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-[3px] min-w-fit">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-3 h-3 rounded-sm ${day.completionPct < 0 ? 'bg-transparent' : getColor(day.completionPct)}`}
                title={day.date ? `${day.date}: ${day.completionPct}%` : ''}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="w-3 h-3 rounded-sm bg-secondary" />
        <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900" />
        <div className="w-3 h-3 rounded-sm bg-green-300 dark:bg-green-700" />
        <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-600" />
        <div className="w-3 h-3 rounded-sm bg-green-500" />
        <span>More</span>
      </div>
    </div>
  );
}
