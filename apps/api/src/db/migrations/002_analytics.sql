-- Migration: 002_analytics.sql
-- Analytics cache and streak tracking tables

-- Daily analytics cache (materialized from completed_routines)
CREATE TABLE daily_analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Completion metrics
  items_completed INT NOT NULL DEFAULT 0,
  items_total INT NOT NULL DEFAULT 0,
  completion_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  
  -- Per-item breakdown JSONB array
  item_breakdown JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  source VARCHAR(10) NOT NULL CHECK (source IN ('analog', 'digital')),
  completed_at TIMESTAMPTZ NOT NULL,
  
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
  
  consistency_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_daily_analytics_routine_date ON daily_analytics_cache(routine_id, date DESC);
CREATE INDEX idx_daily_analytics_date ON daily_analytics_cache(date DESC);
