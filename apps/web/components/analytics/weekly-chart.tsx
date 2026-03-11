'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

interface DayPoint {
  date: string;
  completionPct: number;
  itemsCompleted: number;
  itemsTotal: number;
}

interface WeeklyChartProps {
  data: DayPoint[];
}

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function getBarColor(pct: number): string {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#eab308';
  if (pct > 0) return '#f97316';
  return '#e5e7eb';
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  const chartData = data.map(d => ({
    ...d,
    day: shortDay(d.date),
    fill: getBarColor(d.completionPct),
  }));

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
          <Tooltip
            formatter={(value: any) => [`${value}%`, 'Completion']}
            labelFormatter={(label: any) => label}
          />
          <Bar dataKey="completionPct" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
