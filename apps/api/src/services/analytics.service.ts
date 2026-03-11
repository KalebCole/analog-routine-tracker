import { query, transaction } from '../db/client';
import { Item, isGroupItem, flattenItems, ItemValue } from '@analog-routine-tracker/shared';

// ── Types ──────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  routineId: string;
  routineName: string;
  today: {
    date: string;
    itemsCompleted: number;
    itemsTotal: number;
    completionPct: number;
    source: string | null;
    completed: boolean;
  };
  streaks: {
    current: number;
    longest: number;
    consistencyScore: number;
  };
  weeklyTrend: DayDataPoint[];
}

export interface DayDataPoint {
  date: string;
  completionPct: number;
  itemsCompleted: number;
  itemsTotal: number;
}

export interface HeatmapData {
  routineId: string;
  startDate: string;
  endDate: string;
  days: Array<{ date: string; completionPct: number; completed: boolean }>;
}

export interface ItemBreakdown {
  routineId: string;
  period: { start: string; end: string; totalDays: number; completedDays: number };
  items: Array<{
    itemId: string;
    itemName: string;
    groupName: string | null;
    completionRate: number;
    completedCount: number;
    rank: number;
  }>;
  mostSkipped: Array<{
    itemId: string;
    itemName: string;
    groupName: string | null;
    completionRate: number;
  }>;
}

export interface WeeklyTrends {
  routineId: string;
  weeks: Array<{
    weekStart: string;
    weekEnd: string;
    avgCompletionPct: number;
    daysCompleted: number;
    daysInWeek: number;
  }>;
  bestDayOfWeek: { day: string; avgCompletionPct: number };
  worstDayOfWeek: { day: string; avgCompletionPct: number };
  overallTrend: 'improving' | 'declining' | 'stable';
}

export interface OverviewData {
  date: string;
  routines: Array<{
    routineId: string;
    routineName: string;
    todayCompleted: boolean;
    todayPct: number;
    currentStreak: number;
    consistencyScore: number;
  }>;
  totalItemsToday: { completed: number; total: number };
}

// ── Helpers ────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Build item-name lookup from routine items, including group children */
function buildItemMap(items: Item[]): Map<string, { name: string; groupName: string | null }> {
  const m = new Map<string, { name: string; groupName: string | null }>();
  for (const item of items) {
    if (isGroupItem(item)) {
      for (const child of item.children) {
        m.set(child.id, { name: child.name, groupName: item.name });
      }
    } else {
      m.set(item.id, { name: item.name, groupName: null });
    }
  }
  return m;
}

// ── Cache Updates (write-through) ──────────────────────────────────

export async function updateAnalyticsCache(routineId: string, date: string): Promise<void> {
  // Get the completion + routine items
  const result = await query<{
    values: ItemValue[];
    source: string;
    completed_at: Date;
    items: Item[];
  }>(
    `SELECT cr.values, cr.source, cr.completed_at, r.items
     FROM completed_routines cr
     JOIN routines r ON r.id = cr.routine_id
     WHERE cr.routine_id = $1 AND cr.date = $2`,
    [routineId, date]
  );

  if (result.rows.length === 0) {
    // Completion was deleted — remove cache row
    await query('DELETE FROM daily_analytics_cache WHERE routine_id = $1 AND date = $2', [routineId, date]);
    return;
  }

  const row = result.rows[0];
  const itemMap = buildItemMap(row.items);
  const leafItems = flattenItems(row.items);
  const itemsTotal = leafItems.length;

  // Count completed items (checkbox=true, others=non-null non-empty)
  let itemsCompleted = 0;
  const breakdown: Array<{ itemId: string; itemName: string; completed: boolean; groupName: string | null }> = [];

  for (const leaf of leafItems) {
    const val = row.values.find((v: ItemValue) => v.itemId === leaf.id);
    let completed = false;
    if (val) {
      if (leaf.type === 'checkbox') {
        completed = val.value === true;
      } else {
        completed = val.value != null && val.value !== '' && val.value !== 0;
      }
    }
    if (completed) itemsCompleted++;
    const info = itemMap.get(leaf.id);
    breakdown.push({
      itemId: leaf.id,
      itemName: info?.name ?? leaf.name,
      completed,
      groupName: info?.groupName ?? null,
    });
  }

  const completionPct = itemsTotal > 0 ? Math.round((itemsCompleted / itemsTotal) * 10000) / 100 : 0;

  await query(
    `INSERT INTO daily_analytics_cache (routine_id, date, items_completed, items_total, completion_pct, item_breakdown, source, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (routine_id, date) DO UPDATE SET
       items_completed = EXCLUDED.items_completed,
       items_total = EXCLUDED.items_total,
       completion_pct = EXCLUDED.completion_pct,
       item_breakdown = EXCLUDED.item_breakdown,
       source = EXCLUDED.source,
       completed_at = EXCLUDED.completed_at,
       cached_at = NOW()`,
    [routineId, date, itemsCompleted, itemsTotal, completionPct, JSON.stringify(breakdown), row.source, row.completed_at]
  );
}

export async function updateStreakState(routineId: string): Promise<void> {
  // Get all completion dates sorted desc
  const result = await query<{ date: Date }>(
    'SELECT date FROM completed_routines WHERE routine_id = $1 ORDER BY date DESC',
    [routineId]
  );

  const dates = result.rows.map(r => {
    const d = new Date(r.date);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  let currentStreak = 0;
  let longestStreak = 0;

  if (dates.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const mostRecent = dates[0];
    if (mostRecent.getTime() === today.getTime() || mostRecent.getTime() === yesterday.getTime()) {
      currentStreak = 1;
      let prev = mostRecent;
      for (let i = 1; i < dates.length; i++) {
        const expected = new Date(prev);
        expected.setDate(expected.getDate() - 1);
        if (dates[i].getTime() === expected.getTime()) {
          currentStreak++;
          prev = dates[i];
        } else {
          break;
        }
      }
    }

    // Longest streak
    const asc = [...dates].sort((a, b) => a.getTime() - b.getTime());
    let streak = 1;
    longestStreak = 1;
    for (let i = 1; i < asc.length; i++) {
      const expected = new Date(asc[i - 1]);
      expected.setDate(expected.getDate() + 1);
      if (asc[i].getTime() === expected.getTime()) {
        streak++;
        if (streak > longestStreak) longestStreak = streak;
      } else {
        streak = 1;
      }
    }
  }

  // Get previous consistency score
  const prev = await query<{ consistency_score: string }>(
    'SELECT consistency_score FROM streak_state WHERE routine_id = $1',
    [routineId]
  );
  const prevScore = prev.rows.length > 0 ? parseFloat(prev.rows[0].consistency_score) : 0;
  const alpha = 0.05;
  const todayCompleted = dates.length > 0 && dateStr(dates[0]) === todayStr();
  const newScore = alpha * (todayCompleted ? 100 : 0) + (1 - alpha) * prevScore;

  const lastDate = dates.length > 0 ? dateStr(dates[0]) : null;

  await query(
    `INSERT INTO streak_state (routine_id, current_streak, longest_streak, last_completed_date, consistency_score)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (routine_id) DO UPDATE SET
       current_streak = EXCLUDED.current_streak,
       longest_streak = EXCLUDED.longest_streak,
       last_completed_date = EXCLUDED.last_completed_date,
       consistency_score = EXCLUDED.consistency_score,
       updated_at = NOW()`,
    [routineId, currentStreak, longestStreak, lastDate, Math.round(newScore * 100) / 100]
  );
}

// ── Backfill ──────────────────────────────────────────────────────

export async function backfillAnalyticsCache(): Promise<{ processed: number }> {
  const completions = await query<{ routine_id: string; date: Date }>(
    'SELECT DISTINCT routine_id, date FROM completed_routines ORDER BY date'
  );

  for (const row of completions.rows) {
    await updateAnalyticsCache(row.routine_id, dateStr(row.date));
  }

  // Update streak state for all routines
  const routines = await query<{ id: string }>('SELECT id FROM routines');
  for (const r of routines.rows) {
    await updateStreakState(r.id);
  }

  return { processed: completions.rows.length };
}

// ── Read Queries ──────────────────────────────────────────────────

export async function getAnalyticsSummary(routineId: string): Promise<AnalyticsSummary | null> {
  const routine = await query<{ id: string; name: string; items: Item[] }>(
    'SELECT id, name, items FROM routines WHERE id = $1',
    [routineId]
  );
  if (routine.rows.length === 0) return null;

  const r = routine.rows[0];
  const today = todayStr();
  const leafCount = flattenItems(r.items).length;

  // Today's cache
  const todayCache = await query<{
    items_completed: number;
    items_total: number;
    completion_pct: string;
    source: string;
  }>(
    'SELECT items_completed, items_total, completion_pct, source FROM daily_analytics_cache WHERE routine_id = $1 AND date = $2',
    [routineId, today]
  );

  // Streak state
  const streakRow = await query<{
    current_streak: number;
    longest_streak: number;
    consistency_score: string;
  }>(
    'SELECT current_streak, longest_streak, consistency_score FROM streak_state WHERE routine_id = $1',
    [routineId]
  );

  // Weekly trend (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weeklyRows = await query<{
    date: Date;
    items_completed: number;
    items_total: number;
    completion_pct: string;
  }>(
    'SELECT date, items_completed, items_total, completion_pct FROM daily_analytics_cache WHERE routine_id = $1 AND date >= $2 ORDER BY date',
    [routineId, dateStr(weekAgo)]
  );

  // Build 7-day array with gaps filled
  const weeklyMap = new Map(weeklyRows.rows.map(r => [dateStr(r.date), r]));
  const weeklyTrend: DayDataPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateStr(d);
    const cached = weeklyMap.get(ds);
    weeklyTrend.push({
      date: ds,
      completionPct: cached ? parseFloat(cached.completion_pct) : 0,
      itemsCompleted: cached ? cached.items_completed : 0,
      itemsTotal: cached ? cached.items_total : leafCount,
    });
  }

  const tc = todayCache.rows[0];
  const ss = streakRow.rows[0];

  return {
    routineId,
    routineName: r.name,
    today: {
      date: today,
      itemsCompleted: tc ? tc.items_completed : 0,
      itemsTotal: tc ? tc.items_total : leafCount,
      completionPct: tc ? parseFloat(tc.completion_pct) : 0,
      source: tc ? tc.source : null,
      completed: !!tc,
    },
    streaks: {
      current: ss ? ss.current_streak : 0,
      longest: ss ? ss.longest_streak : 0,
      consistencyScore: ss ? parseFloat(ss.consistency_score) : 0,
    },
    weeklyTrend,
  };
}

export async function getHeatmapData(routineId: string, months: number = 3): Promise<HeatmapData> {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);

  const rows = await query<{ date: Date; completion_pct: string }>(
    'SELECT date, completion_pct FROM daily_analytics_cache WHERE routine_id = $1 AND date >= $2 AND date <= $3 ORDER BY date',
    [routineId, dateStr(start), dateStr(end)]
  );

  const map = new Map(rows.rows.map(r => [dateStr(r.date), parseFloat(r.completion_pct)]));
  const days: Array<{ date: string; completionPct: number; completed: boolean }> = [];

  const cur = new Date(start);
  while (cur <= end) {
    const ds = dateStr(cur);
    const pct = map.get(ds) ?? 0;
    days.push({ date: ds, completionPct: pct, completed: pct > 0 });
    cur.setDate(cur.getDate() + 1);
  }

  return { routineId, startDate: dateStr(start), endDate: dateStr(end), days };
}

export async function getItemBreakdown(routineId: string, days: number = 30): Promise<ItemBreakdown | null> {
  const routine = await query<{ id: string; items: Item[] }>(
    'SELECT id, items FROM routines WHERE id = $1',
    [routineId]
  );
  if (routine.rows.length === 0) return null;

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);

  const rows = await query<{ item_breakdown: any[]; date: Date }>(
    'SELECT item_breakdown, date FROM daily_analytics_cache WHERE routine_id = $1 AND date >= $2 AND date <= $3',
    [routineId, dateStr(start), dateStr(end)]
  );

  const completedDays = rows.rows.length;
  const itemMap = buildItemMap(routine.rows[0].items);

  // Aggregate per-item completions
  const itemCounts = new Map<string, number>();
  for (const row of rows.rows) {
    const breakdown = Array.isArray(row.item_breakdown) ? row.item_breakdown : [];
    for (const entry of breakdown) {
      if (entry.completed) {
        itemCounts.set(entry.itemId, (itemCounts.get(entry.itemId) || 0) + 1);
      }
    }
  }

  const items = Array.from(itemMap.entries()).map(([id, info]) => {
    const count = itemCounts.get(id) || 0;
    const rate = completedDays > 0 ? Math.round((count / completedDays) * 1000) / 10 : 0;
    return { itemId: id, itemName: info.name, groupName: info.groupName, completionRate: rate, completedCount: count, rank: 0 };
  });

  items.sort((a, b) => b.completionRate - a.completionRate);
  items.forEach((item, i) => { item.rank = i + 1; });

  const mostSkipped = items.slice(-3).reverse().map(i => ({
    itemId: i.itemId, itemName: i.itemName, groupName: i.groupName, completionRate: i.completionRate,
  }));

  return {
    routineId,
    period: { start: dateStr(start), end: dateStr(end), totalDays: days, completedDays },
    items,
    mostSkipped,
  };
}

export async function getWeeklyTrends(routineId: string, weeks: number = 12): Promise<WeeklyTrends> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - weeks * 7);

  const rows = await query<{ date: Date; completion_pct: string }>(
    'SELECT date, completion_pct FROM daily_analytics_cache WHERE routine_id = $1 AND date >= $2 AND date <= $3 ORDER BY date',
    [routineId, dateStr(start), dateStr(end)]
  );

  // Group by week
  const weekBuckets = new Map<string, { pcts: number[]; days: number }>();
  const dayOfWeekPcts = new Map<number, number[]>(); // 0=Sun..6=Sat

  for (const row of rows.rows) {
    const d = new Date(row.date);
    const pct = parseFloat(row.completion_pct);
    const dow = d.getDay();
    if (!dayOfWeekPcts.has(dow)) dayOfWeekPcts.set(dow, []);
    dayOfWeekPcts.get(dow)!.push(pct);

    // Week start (Monday)
    const weekStart = new Date(d);
    const dayNum = d.getDay() || 7;
    weekStart.setDate(d.getDate() - dayNum + 1);
    const key = dateStr(weekStart);
    if (!weekBuckets.has(key)) weekBuckets.set(key, { pcts: [], days: 0 });
    const bucket = weekBuckets.get(key)!;
    bucket.pcts.push(pct);
    bucket.days++;
  }

  const weekArray = Array.from(weekBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ws, b]) => {
      const weekEnd = new Date(ws);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return {
        weekStart: ws,
        weekEnd: dateStr(weekEnd),
        avgCompletionPct: Math.round(b.pcts.reduce((s, v) => s + v, 0) / b.pcts.length * 100) / 100,
        daysCompleted: b.days,
        daysInWeek: 7,
      };
    });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let bestDay = { day: 'Monday', avgCompletionPct: 0 };
  let worstDay = { day: 'Monday', avgCompletionPct: 100 };

  for (const [dow, pcts] of dayOfWeekPcts) {
    const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length;
    if (avg >= bestDay.avgCompletionPct) bestDay = { day: dayNames[dow], avgCompletionPct: Math.round(avg * 100) / 100 };
    if (avg <= worstDay.avgCompletionPct) worstDay = { day: dayNames[dow], avgCompletionPct: Math.round(avg * 100) / 100 };
  }

  // Trend: compare first half vs second half
  let overallTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (weekArray.length >= 4) {
    const mid = Math.floor(weekArray.length / 2);
    const firstHalf = weekArray.slice(0, mid).reduce((s, w) => s + w.avgCompletionPct, 0) / mid;
    const secondHalf = weekArray.slice(mid).reduce((s, w) => s + w.avgCompletionPct, 0) / (weekArray.length - mid);
    if (secondHalf - firstHalf > 5) overallTrend = 'improving';
    else if (firstHalf - secondHalf > 5) overallTrend = 'declining';
  }

  return { routineId, weeks: weekArray, bestDayOfWeek: bestDay, worstDayOfWeek: worstDay, overallTrend };
}

export async function getOverview(): Promise<OverviewData> {
  const today = todayStr();
  const routines = await query<{ id: string; name: string; items: Item[] }>(
    'SELECT id, name, items FROM routines ORDER BY name'
  );

  let totalCompleted = 0;
  let totalItems = 0;
  const routineData: OverviewData['routines'] = [];

  for (const r of routines.rows) {
    const leafCount = flattenItems(r.items).length;
    totalItems += leafCount;

    const cache = await query<{ items_completed: number; completion_pct: string }>(
      'SELECT items_completed, completion_pct FROM daily_analytics_cache WHERE routine_id = $1 AND date = $2',
      [r.id, today]
    );

    const streak = await query<{ current_streak: number; consistency_score: string }>(
      'SELECT current_streak, consistency_score FROM streak_state WHERE routine_id = $1',
      [r.id]
    );

    const c = cache.rows[0];
    const s = streak.rows[0];
    totalCompleted += c ? c.items_completed : 0;

    routineData.push({
      routineId: r.id,
      routineName: r.name,
      todayCompleted: !!c,
      todayPct: c ? parseFloat(c.completion_pct) : 0,
      currentStreak: s ? s.current_streak : 0,
      consistencyScore: s ? parseFloat(s.consistency_score) : 0,
    });
  }

  return {
    date: today,
    routines: routineData,
    totalItemsToday: { completed: totalCompleted, total: totalItems },
  };
}
