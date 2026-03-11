# Analytics Dashboard — Feature Spec

> **Status:** Ready for implementation
> **Priority:** High — core value prop after data entry is solved
> **Estimated effort:** ~3-4 weeks across 4 phases

---

## 1. Research & Inspiration

### What Top Habit Trackers Do

| App | Streaks | Completion % | Calendar Heatmap | Charts/Trends | Per-Item Breakdown | Insights/Skipped |
|-----|---------|-------------|-----------------|---------------|-------------------|-----------------|
| **Routinery** | ✅ Plant badges grow with streak | ✅ Weekly/monthly status widgets | ✅ iOS widgets | ✅ To-do analytics view | ❌ | ❌ |
| **Loop Habit Tracker** | ✅ Current + best | ✅ Weighted score (not binary) | ✅ GitHub-style heatmap | ✅ Bar charts, line charts, histograms | ✅ Per-habit detail view | ❌ |
| **Streaks** (iOS) | ✅ Core mechanic | ✅ Daily ring completion | ✅ Calendar grid | ❌ Minimal | ❌ | ❌ |
| **Habitica** | ✅ Task streaks | ❌ | ❌ | ❌ Focus is gamification | ❌ | ❌ |
| **Productive** | ✅ | ✅ Per-habit rate | ✅ Calendar view | ✅ Weekly/monthly charts | ✅ | ❌ |

### What to Steal

1. **Loop Habit Tracker's weighted score** — exponentially weighted moving average instead of raw streaks. More forgiving, less "all or nothing" thinking. Formula: `score = α * today + (1-α) * yesterday_score` where α ≈ 0.05.
2. **GitHub-style contribution heatmap** — universally understood, compact, satisfying.
3. **Loop's per-habit bar chart** — shows which habits you're nailing vs skipping.
4. **Routinery's streak badges** — visual reward, but we'll keep it minimal (no gamification bloat).

### What to Skip

- Gamification (Habitica-style XP/levels) — scope creep, doesn't fit the analog vibe
- Social features — single-user app
- AI insights — v2, not v1
- Complex goal-setting UI — the routine IS the goal

### Behavioral Science — What Actually Matters

Research-backed principles guiding metric selection:

1. **Self-monitoring drives change** (Harkin et al., 2016 meta-analysis, 19k participants): Simply tracking increases goal attainment. Our whole app is this.
2. **Binary tracking > complex metrics during formation** (2025 study): People using yes/no tracking maintained habits 27% longer than detailed metrics. → Default view should be simple checkmarks, detailed stats are opt-in deeper views.
3. **Streaks drive 40% more effort** (behavioral economics research): People expend significantly more effort to maintain a streak. → Streaks are prominent but NOT the only metric (to avoid "what the hell" effect when broken).
4. **Small wins > big achievements** (Amabile, Harvard): Incremental visible progress is the strongest motivator. → Show daily progress, not just monthly summaries.
5. **Leading indicators > lagging** (2018, Behavior Research Methods): Track behaviors that predict success (completion consistency) not just outcomes. → Consistency score alongside completion rate.
6. **"What the hell" effect** — breaking a streak causes people to give up entirely. → Mitigate by showing "completion rate" and "consistency score" alongside streaks, so a broken streak doesn't feel like total failure.

---

## 2. Data Model

### Existing Schema (for reference)

```
routines (id, name, items JSONB, version, created_at, modified_at)
completed_routines (id, routine_id, routine_version, date, completed_at, source, values JSONB, photo_url, photo_expires_at)
```

The `completed_routines.values` JSONB stores per-item values. This is our raw data source — **no new tables needed for Phase 1**. All metrics can be computed from existing data.

### New Table: `daily_analytics_cache`

Materialized/cached daily rollup for fast dashboard queries. Computed on write (when a completion is saved) and on-demand.

```sql
-- Migration: 002_analytics.sql

-- Daily analytics cache (materialized from completed_routines)
CREATE TABLE daily_analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Completion metrics
  items_completed INT NOT NULL DEFAULT 0,
  items_total INT NOT NULL DEFAULT 0,
  completion_pct NUMERIC(5,2) NOT NULL DEFAULT 0, -- 0.00 to 100.00
  
  -- Per-item breakdown (JSONB array)
  -- [{itemId, itemName, completed: bool, groupName?: string}]
  item_breakdown JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  source VARCHAR(10) NOT NULL CHECK (source IN ('analog', 'digital')),
  completed_at TIMESTAMPTZ NOT NULL,
  
  -- Timestamps
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(routine_id, date)
);

-- Streak tracking (updated on each completion)
CREATE TABLE streak_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL UNIQUE REFERENCES routines(id) ON DELETE CASCADE,
  
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_completed_date DATE,
  
  -- Consistency score (exponentially weighted moving average, 0-100)
  consistency_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_daily_analytics_routine_date ON daily_analytics_cache(routine_id, date DESC);
CREATE INDEX idx_daily_analytics_date ON daily_analytics_cache(date DESC);
```

### Why a Cache Table?

Computing per-item completion rates across 365 days of JSONB `values` arrays on every dashboard load is expensive. The cache:
- Flattens JSONB values into queryable columns
- Enables fast GROUP BY queries for trends
- Is updated write-through (on completion save) so reads are instant
- Can be rebuilt from `completed_routines` if corrupted

### Migration Strategy

1. Add migration `002_analytics.sql` with the tables above
2. Add a backfill script that populates `daily_analytics_cache` and `streak_state` from existing `completed_routines` data
3. Update completion save/edit/delete flows to maintain the cache

---

## 3. Metrics to Track

### Tier 1 — Always Visible (Dashboard)

| Metric | Definition | Source |
|--------|-----------|--------|
| **Today's completion** | `X/Y items` + percentage | `daily_analytics_cache` for today |
| **Current streak** | Consecutive days with ≥1 completion | `streak_state.current_streak` |
| **Longest streak** | All-time max | `streak_state.longest_streak` |
| **Consistency score** | EWMA (α=0.05), 0-100 | `streak_state.consistency_score` |
| **7-day completion trend** | Bar chart, last 7 days | `daily_analytics_cache` last 7 rows |

### Tier 2 — Detail Views (Tap to Expand)

| Metric | Definition |
|--------|-----------|
| **Monthly heatmap** | Calendar grid colored by completion % |
| **Per-item completion rate** | % of days each item was completed (last 30d) |
| **Most skipped items** | Bottom 3 items by completion rate |
| **Weekly average** | Mean completion % per week |
| **Best day of week** | Day with highest avg completion |
| **Source breakdown** | Analog vs digital completion ratio |

### Tier 3 — Future (v2)

- Time-of-day patterns (when do you complete?)
- Cross-routine correlations
- Predictive "at risk" warnings
- Custom date range filters

### Consistency Score Formula

```
score_today = α * (completed_today ? 100 : 0) + (1 - α) * score_yesterday
where α = 0.05
```

This means:
- Completing every day converges to ~100
- Missing one day barely dips (95→90.25)
- Missing a week drops noticeably but recovers
- Much more forgiving than streaks

---

## 4. API Endpoints

### `GET /api/routines/:id/analytics/summary`

Dashboard summary for a single routine.

**Response:**
```json
{
  "routineId": "uuid",
  "routineName": "Morning Routine",
  "today": {
    "date": "2026-03-10",
    "itemsCompleted": 18,
    "itemsTotal": 20,
    "completionPct": 90.0,
    "source": "analog",
    "completed": true
  },
  "streaks": {
    "current": 14,
    "longest": 42,
    "consistencyScore": 87.5
  },
  "weeklyTrend": [
    { "date": "2026-03-04", "completionPct": 85.0, "itemsCompleted": 17, "itemsTotal": 20 },
    { "date": "2026-03-05", "completionPct": 100.0, "itemsCompleted": 20, "itemsTotal": 20 },
    { "date": "2026-03-06", "completionPct": 0, "itemsCompleted": 0, "itemsTotal": 20 },
    { "date": "2026-03-07", "completionPct": 90.0, "itemsCompleted": 18, "itemsTotal": 20 },
    { "date": "2026-03-08", "completionPct": 95.0, "itemsCompleted": 19, "itemsTotal": 20 },
    { "date": "2026-03-09", "completionPct": 100.0, "itemsCompleted": 20, "itemsTotal": 20 },
    { "date": "2026-03-10", "completionPct": 90.0, "itemsCompleted": 18, "itemsTotal": 20 }
  ]
}
```

### `GET /api/routines/:id/analytics/heatmap?months=3`

Monthly heatmap data (default 3 months).

**Response:**
```json
{
  "routineId": "uuid",
  "startDate": "2025-12-10",
  "endDate": "2026-03-10",
  "days": [
    { "date": "2025-12-10", "completionPct": 85.0, "completed": true },
    { "date": "2025-12-11", "completionPct": 0, "completed": false },
    ...
  ]
}
```

### `GET /api/routines/:id/analytics/items?days=30`

Per-item breakdown (default 30 days).

**Response:**
```json
{
  "routineId": "uuid",
  "period": { "start": "2026-02-08", "end": "2026-03-10", "totalDays": 30, "completedDays": 26 },
  "items": [
    {
      "itemId": "uuid",
      "itemName": "Brush teeth",
      "groupName": null,
      "completionRate": 100.0,
      "completedCount": 26,
      "rank": 1
    },
    {
      "itemId": "uuid",
      "itemName": "Journal",
      "groupName": "Mindfulness",
      "completionRate": 61.5,
      "completedCount": 16,
      "rank": 15
    }
  ],
  "mostSkipped": [
    { "itemId": "uuid", "itemName": "Cold shower", "groupName": null, "completionRate": 23.1 },
    { "itemId": "uuid", "itemName": "Meditation", "groupName": "Mindfulness", "completionRate": 42.3 },
    { "itemId": "uuid", "itemName": "Journal", "groupName": "Mindfulness", "completionRate": 61.5 }
  ]
}
```

### `GET /api/routines/:id/analytics/trends?weeks=12`

Weekly aggregated trends (default 12 weeks).

**Response:**
```json
{
  "routineId": "uuid",
  "weeks": [
    {
      "weekStart": "2025-12-16",
      "weekEnd": "2025-12-22",
      "avgCompletionPct": 72.5,
      "daysCompleted": 5,
      "daysInWeek": 7
    },
    ...
  ],
  "bestDayOfWeek": { "day": "Monday", "avgCompletionPct": 92.3 },
  "worstDayOfWeek": { "day": "Saturday", "avgCompletionPct": 45.0 },
  "overallTrend": "improving"  // "improving" | "declining" | "stable"
}
```

### `GET /api/analytics/overview`

Cross-routine overview (for home dashboard).

**Response:**
```json
{
  "date": "2026-03-10",
  "routines": [
    {
      "routineId": "uuid",
      "routineName": "Morning Routine",
      "todayCompleted": true,
      "todayPct": 90.0,
      "currentStreak": 14,
      "consistencyScore": 87.5
    },
    {
      "routineId": "uuid",
      "routineName": "Night Routine",
      "todayCompleted": false,
      "todayPct": 0,
      "currentStreak": 3,
      "consistencyScore": 65.2
    }
  ],
  "totalItemsToday": { "completed": 18, "total": 38 }
}
```

---

## 5. Dashboard UI

### Chart Library: **Recharts**

Why Recharts:
- React-native, composable components (fits Next.js perfectly)
- Responsive out of the box
- Lightweight (~45KB gzipped)
- Great mobile touch support
- Simple API, minimal config
- Already used by shadcn/ui dashboard templates

Install: `npm install recharts` in `apps/web`

Alternatives considered:
- Chart.js: Canvas-based, less React-native, heavier
- Nivo: Beautiful but heavy (~100KB+), overkill
- Tremor: Nice but adds full component library dependency

### Views & Layout

#### 5a. Analytics Home (`/routines/:id/analytics`)

Mobile-first, single column, scrollable.

```
┌─────────────────────────────┐
│ ← Morning Routine           │
│                              │
│ ┌──────────────────────────┐ │
│ │  Today: 18/20 (90%)      │ │
│ │  ████████████████░░      │ │ ← progress bar
│ └──────────────────────────┘ │
│                              │
│ ┌───────────┐ ┌────────────┐ │
│ │ 🔥 14 day │ │ 🏆 42 day  │ │
│ │  streak   │ │  best      │ │
│ └───────────┘ └────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ Consistency: 87.5        │ │
│ │ ████████████████████░░░  │ │ ← colored gauge
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ Last 7 Days              │ │
│ │ █ █   █ █ █ █            │ │ ← bar chart
│ │ M T W T F S S            │ │
│ │       85 100 0 90 95 100 │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ March 2026               │ │
│ │ Mo Tu We Th Fr Sa Su     │ │
│ │  ■  ■  □  ■  ■  ◧  □    │ │ ← heatmap calendar
│ │  ■  ■  ■  ■  ■  ■  □    │ │   ■=100% ◧=partial □=miss
│ │  ■  ■  ◧  ■  ■  ...     │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ Most Skipped             │ │
│ │ 1. Cold shower    23%    │ │
│ │ 2. Meditation     42%    │ │
│ │ 3. Journal        62%    │ │
│ └──────────────────────────┘ │
│                              │
│ [View All Items →]           │
│ [View Trends →]              │
└─────────────────────────────┘
```

#### 5b. Per-Item Detail (`/routines/:id/analytics/items`)

```
┌─────────────────────────────┐
│ ← Item Breakdown (30 days)  │
│                              │
│ ┌──────────────────────────┐ │
│ │ Brush teeth       100% ██│ │
│ │ Make bed           96% ██│ │
│ │ Vitamins           92% ██│ │
│ │ Stretch            85% █▓│ │
│ │ Read 10 min        77% █░│ │
│ │ ...                       │
│ │ Journal            62% █░│ │
│ │ Meditation         42% ▓░│ │
│ │ Cold shower        23% ░░│ │
│ └──────────────────────────┘ │
│                              │
│ [Filter by group ▼]         │
└─────────────────────────────┘
```

#### 5c. Trends View (`/routines/:id/analytics/trends`)

```
┌─────────────────────────────┐
│ ← Trends (12 weeks)         │
│                              │
│ ┌──────────────────────────┐ │
│ │ Weekly Average            │
│ │     ╱‾‾╲   ╱‾╲  ╱‾      │ │ ← line chart
│ │ ╱‾╱     ╲╱    ╲╱        │ │
│ │ W1  W4  W8  W12          │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ Best Day:    Monday 92%  │ │
│ │ Worst Day:   Saturday 45%│ │
│ │ Trend:       ↗ Improving │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ By Day of Week            │
│ │ Mo ████████████ 92%      │ │
│ │ Tu ██████████   81%      │ │
│ │ We █████████    78%      │ │
│ │ Th ██████████   80%      │ │
│ │ Fr █████████    75%      │ │
│ │ Sa █████        45%      │ │
│ │ Su ██████       52%      │ │
│ └──────────────────────────┘ │
└─────────────────────────────┘
```

#### 5d. Overview Dashboard (Home page enhancement)

Add an analytics summary to the existing home/routine list page:

```
┌─────────────────────────────┐
│ Your Routines                │
│                              │
│ ┌──────────────────────────┐ │
│ │ Morning Routine          │ │
│ │ ✅ 18/20 today  🔥14    │ │
│ │ ████████████████░░  90%  │ │
│ │ [Complete] [Analytics]   │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ Night Routine            │ │
│ │ ⬜ Not done yet  🔥3    │ │
│ │ ░░░░░░░░░░░░░░░░░░  0%  │ │
│ │ [Complete] [Analytics]   │ │
│ └──────────────────────────┘ │
└─────────────────────────────┘
```

### Color Scheme for Heatmap

Use 5 levels (like GitHub contributions):
- `#161b22` — no data / not completed (0%)
- `#0e4429` — low (1-25%)
- `#006d32` — medium-low (26-50%)
- `#26a641` — medium-high (51-75%)
- `#39d353` — high (76-100%)

---

## 6. Frontend Components

All components go in `apps/web/components/analytics/`:

| Component | File | Description |
|-----------|------|-------------|
| `AnalyticsSummary` | `analytics-summary.tsx` | Top-level dashboard with today + streaks + 7-day chart |
| `CompletionBar` | `completion-bar.tsx` | Animated progress bar with count label |
| `StreakCard` | `streak-card.tsx` | Current/longest streak display with fire emoji |
| `ConsistencyGauge` | `consistency-gauge.tsx` | Score bar (0-100) with color gradient |
| `WeeklyBarChart` | `weekly-bar-chart.tsx` | 7-day Recharts BarChart |
| `HeatmapCalendar` | `heatmap-calendar.tsx` | GitHub-style calendar grid (custom, no lib needed) |
| `MostSkippedList` | `most-skipped-list.tsx` | Top 3 most-skipped items |
| `ItemBreakdownList` | `item-breakdown-list.tsx` | All items sorted by completion rate |
| `TrendLineChart` | `trend-line-chart.tsx` | Weekly trend Recharts LineChart |
| `DayOfWeekChart` | `day-of-week-chart.tsx` | Horizontal bar chart by day |
| `RoutineOverviewCard` | `routine-overview-card.tsx` | Summary card for home page |

### Routing

```
/routines/:id/analytics          → Main analytics dashboard
/routines/:id/analytics/items    → Per-item breakdown
/routines/:id/analytics/trends   → Weekly trends + day-of-week
```

---

## 7. Backend Service Layer

### New File: `apps/api/src/services/analytics.service.ts`

```typescript
// Core functions:

// Called on every completion save/edit/delete
export async function updateAnalyticsCache(routineId: string, date: string): Promise<void>

// Called on completion save — updates streaks + consistency
export async function updateStreakState(routineId: string): Promise<void>

// Dashboard summary
export async function getAnalyticsSummary(routineId: string): Promise<AnalyticsSummary>

// Heatmap data
export async function getHeatmapData(routineId: string, months: number): Promise<HeatmapData>

// Per-item breakdown
export async function getItemBreakdown(routineId: string, days: number): Promise<ItemBreakdown>

// Weekly trends
export async function getWeeklyTrends(routineId: string, weeks: number): Promise<WeeklyTrends>

// Cross-routine overview
export async function getOverview(): Promise<OverviewData>

// Backfill cache from existing completions (run once during migration)
export async function backfillAnalyticsCache(): Promise<{ processed: number }>
```

### New File: `apps/api/src/routes/analytics.ts`

```typescript
const router = Router();

router.get('/routines/:id/analytics/summary', ...)
router.get('/routines/:id/analytics/heatmap', ...)
router.get('/routines/:id/analytics/items', ...)
router.get('/routines/:id/analytics/trends', ...)
router.get('/analytics/overview', ...)

// Admin: rebuild cache
router.post('/admin/analytics/rebuild', ...)
```

### Hook into Existing Completion Flow

In `apps/api/src/routes/completions.ts`, after saving a completion:

```typescript
// After INSERT into completed_routines:
await updateAnalyticsCache(routineId, date);
await updateStreakState(routineId);
```

Same for edit and delete operations.

---

## 8. Shared Types

Add to `packages/shared/src/types.ts`:

```typescript
// Analytics types
export interface AnalyticsSummaryDTO {
  routineId: string;
  routineName: string;
  today: {
    date: string;
    itemsCompleted: number;
    itemsTotal: number;
    completionPct: number;
    source: CompletionSource | null;
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

export interface HeatmapDTO {
  routineId: string;
  startDate: string;
  endDate: string;
  days: Array<{
    date: string;
    completionPct: number;
    completed: boolean;
  }>;
}

export interface ItemBreakdownDTO {
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

export interface WeeklyTrendsDTO {
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

export interface AnalyticsOverviewDTO {
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
```

---

## 9. Implementation Plan

### Phase 1: Data Layer + Cache (3-4 days)

**Files to create/modify:**
- `apps/api/src/db/migrations/002_analytics.sql` — new tables
- `apps/api/src/services/analytics.service.ts` — core analytics logic
- `apps/api/src/routes/completions.ts` — hook cache updates into save/edit/delete
- `packages/shared/src/types.ts` — add analytics DTOs
- `apps/api/src/db/migrate.ts` — register new migration

**Tasks:**
1. Create migration with `daily_analytics_cache` and `streak_state` tables
2. Implement `updateAnalyticsCache()` — compute and upsert cache row from `completed_routines`
3. Implement `updateStreakState()` — compute current/longest streak + consistency score
4. Write `backfillAnalyticsCache()` — populate cache from all existing completions
5. Hook into completion create/edit/delete flows
6. Add backfill to migration runner (or admin endpoint)

**Complexity:** Medium — mostly SQL queries and data transformation
**Dependencies:** None (builds on existing schema)

### Phase 2: API Endpoints (2-3 days)

**Files to create/modify:**
- `apps/api/src/routes/analytics.ts` — all analytics endpoints
- `apps/api/src/routes/index.ts` — register analytics routes
- `packages/shared/src/validation.ts` — add query param validation schemas

**Tasks:**
1. Implement `GET /routines/:id/analytics/summary`
2. Implement `GET /routines/:id/analytics/heatmap`
3. Implement `GET /routines/:id/analytics/items`
4. Implement `GET /routines/:id/analytics/trends`
5. Implement `GET /analytics/overview`
6. Add `POST /admin/analytics/rebuild` for cache rebuilds
7. Add query param validation (months, days, weeks params)

**Complexity:** Medium — SQL aggregations, date math
**Dependencies:** Phase 1

### Phase 3: Dashboard UI — Core (4-5 days)

**Files to create:**
- `apps/web/components/analytics/*.tsx` — all components listed in §6
- `apps/web/app/routines/[id]/analytics/page.tsx` — main dashboard page
- `apps/web/hooks/use-analytics.ts` — data fetching hooks
- `apps/web/lib/api.ts` — add analytics API methods

**Tasks:**
1. Install recharts: `npm install recharts`
2. Add API client methods for all analytics endpoints
3. Build `AnalyticsSummary` (today's completion + streaks + consistency)
4. Build `WeeklyBarChart` (7-day Recharts bar chart)
5. Build `HeatmapCalendar` (custom CSS grid, no library)
6. Build `MostSkippedList`
7. Compose into analytics dashboard page
8. Add "Analytics" link/button to routine detail page

**Complexity:** Medium-High — most frontend work, responsive design
**Dependencies:** Phase 2

### Phase 4: Detail Views + Polish (3-4 days)

**Files to create:**
- `apps/web/app/routines/[id]/analytics/items/page.tsx`
- `apps/web/app/routines/[id]/analytics/trends/page.tsx`
- `apps/web/components/analytics/item-breakdown-list.tsx`
- `apps/web/components/analytics/trend-line-chart.tsx`
- `apps/web/components/analytics/day-of-week-chart.tsx`
- `apps/web/components/analytics/routine-overview-card.tsx`

**Tasks:**
1. Build per-item breakdown page with horizontal bar chart
2. Build trends page with line chart + day-of-week breakdown
3. Build `RoutineOverviewCard` for home page
4. Add analytics summary to home page routine cards
5. Add loading skeletons for all analytics components
6. Responsive testing (phone-first)
7. Empty states (no data yet, < 7 days of data)

**Complexity:** Medium — builds on Phase 3 patterns
**Dependencies:** Phase 3

---

## 10. Technical Notes

### Performance
- Heatmap: 3 months = ~90 rows from cache. Fast.
- Item breakdown: Aggregates over JSONB `item_breakdown` in cache — keep to 30-60 days
- Weekly trends: 12 rows max. Trivial.
- Consider adding `REFRESH MATERIALIZED VIEW` if cache table grows (future, not v1)

### Mobile Considerations
- All charts must be touch-friendly (Recharts handles this)
- Heatmap cells: minimum 20x20px tap targets
- Use `ResponsiveContainer` from Recharts for all charts
- Horizontal scrolling for heatmap on very small screens
- Dark theme support (the app likely uses dark mode — use chart colors that work on dark bg)

### Empty States
- < 1 day: "Complete your first routine to see analytics!"
- < 7 days: Show what we have, hide weekly trend, show "X more days until weekly insights"
- < 30 days: Show items with caveat "Based on X days of data"

### Existing Stats Service
- `apps/api/src/services/stats.service.ts` already computes streaks + completion rate
- **Refactor plan:** Move streak logic into `analytics.service.ts`, update `streak_state` table on writes, and have the old `getRoutineStats()` read from `streak_state` instead of recomputing every time
- Keep backward compatibility with existing `/routines/:id/stats` endpoint

---

## 11. File Manifest

Complete list of files to create or modify:

### Create
```
apps/api/src/db/migrations/002_analytics.sql
apps/api/src/services/analytics.service.ts
apps/api/src/routes/analytics.ts
apps/web/app/routines/[id]/analytics/page.tsx
apps/web/app/routines/[id]/analytics/items/page.tsx
apps/web/app/routines/[id]/analytics/trends/page.tsx
apps/web/components/analytics/analytics-summary.tsx
apps/web/components/analytics/completion-bar.tsx
apps/web/components/analytics/streak-card.tsx
apps/web/components/analytics/consistency-gauge.tsx
apps/web/components/analytics/weekly-bar-chart.tsx
apps/web/components/analytics/heatmap-calendar.tsx
apps/web/components/analytics/most-skipped-list.tsx
apps/web/components/analytics/item-breakdown-list.tsx
apps/web/components/analytics/trend-line-chart.tsx
apps/web/components/analytics/day-of-week-chart.tsx
apps/web/components/analytics/routine-overview-card.tsx
apps/web/hooks/use-analytics.ts
```

### Modify
```
packages/shared/src/types.ts          — add analytics DTOs
packages/shared/src/validation.ts     — add analytics query schemas
apps/api/src/routes/index.ts          — register analytics routes
apps/api/src/routes/completions.ts    — hook cache updates
apps/api/src/db/migrate.ts            — register migration 002
apps/web/lib/api.ts                   — add analytics API methods
apps/web/app/routines/[id]/page.tsx   — add analytics link
apps/web/app/page.tsx                 — add overview cards
apps/web/package.json                 — add recharts dependency
```
