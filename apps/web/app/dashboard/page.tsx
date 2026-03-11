'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompletionBar } from '@/components/analytics/completion-bar';
import { StreakCard } from '@/components/analytics/streak-card';
import { WeeklyChart } from '@/components/analytics/weekly-chart';
import { CalendarHeatmap } from '@/components/analytics/calendar-heatmap';
import { MostSkipped } from '@/components/analytics/most-skipped';
import { api } from '@/lib/api';
import { useRoutines } from '@/hooks/use-routines';

export default function DashboardPage() {
  const { routines, isLoading: routinesLoading } = useRoutines();
  const [selectedRoutine, setSelectedRoutine] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any>(null);
  const [items, setItems] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-select first routine
  useEffect(() => {
    if (routines.length > 0 && !selectedRoutine) {
      setSelectedRoutine(routines[0].id);
    }
  }, [routines, selectedRoutine]);

  // Fetch analytics when routine changes
  useEffect(() => {
    if (!selectedRoutine) return;
    setIsLoading(true);

    Promise.all([
      api.getAnalyticsSummary(selectedRoutine).catch(() => null),
      api.getAnalyticsHeatmap(selectedRoutine, 3).catch(() => null),
      api.getAnalyticsItems(selectedRoutine, 30).catch(() => null),
    ]).then(([s, h, it]) => {
      setSummary(s);
      setHeatmap(h);
      setItems(it);
    }).finally(() => setIsLoading(false));
  }, [selectedRoutine]);

  const refresh = () => {
    if (selectedRoutine) {
      setSelectedRoutine(null);
      setTimeout(() => setSelectedRoutine(selectedRoutine), 0);
    }
  };

  if (routinesLoading) {
    return (
      <div className="container max-w-2xl py-6 px-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Dashboard
          </h1>
        </div>
        <Button variant="outline" size="icon" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      {/* Routine Selector */}
      {routines.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {routines.map((r) => (
            <Button
              key={r.id}
              variant={selectedRoutine === r.id ? 'default' : 'outline'}
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setSelectedRoutine(r.id)}
            >
              {r.name}
            </Button>
          ))}
        </div>
      )}

      {routines.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No routines yet. Create one to see analytics.</p>
          <Button asChild>
            <Link href="/routines/new">Create Routine</Link>
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {/* Today's Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {summary.today.completed ? "Today's Progress" : 'Not completed today'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CompletionBar
                completed={summary.today.itemsCompleted}
                total={summary.today.itemsTotal}
              />
              {summary.today.source && (
                <p className="text-xs text-muted-foreground mt-2">
                  Completed via {summary.today.source}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Streaks */}
          <StreakCard
            current={summary.streaks.current}
            longest={summary.streaks.longest}
            consistencyScore={summary.streaks.consistencyScore}
          />

          {/* Weekly Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.weeklyTrend && summary.weeklyTrend.length > 0 ? (
                <WeeklyChart data={summary.weeklyTrend} />
              ) : (
                <p className="text-sm text-muted-foreground">No data this week</p>
              )}
            </CardContent>
          </Card>

          {/* Calendar Heatmap */}
          {heatmap && heatmap.days && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Last 3 Months</CardTitle>
              </CardHeader>
              <CardContent>
                <CalendarHeatmap days={heatmap.days} />
              </CardContent>
            </Card>
          )}

          {/* Most Skipped */}
          {items && items.mostSkipped && items.mostSkipped.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Most Skipped (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <MostSkipped items={items.mostSkipped} />
              </CardContent>
            </Card>
          )}

          {/* Per-item Breakdown */}
          {items && items.items && items.items.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Item Completion Rates (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.items.map((item: any) => (
                    <div key={item.itemId} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.itemName}</p>
                        {item.groupName && (
                          <p className="text-xs text-muted-foreground">{item.groupName}</p>
                        )}
                      </div>
                      <div className="w-24">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${item.completionRate}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-mono w-12 text-right">{item.completionRate}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : selectedRoutine ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No analytics data yet. Complete a routine to get started!</p>
        </div>
      ) : null}
    </div>
  );
}
