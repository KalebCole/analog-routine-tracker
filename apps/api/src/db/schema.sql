-- Analog Routine Tracker Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Routines table
-- Stores the main routine definitions
CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Routine versions table
-- Stores snapshots of routines when they are edited (for printed card compatibility)
CREATE TABLE routine_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  version INT NOT NULL,
  items_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(routine_id, version)
);

-- Completed routines table
-- Stores individual completion entries (both digital and analog)
CREATE TABLE completed_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  routine_version INT NOT NULL,
  date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(10) NOT NULL CHECK (source IN ('analog', 'digital')),
  values JSONB NOT NULL,
  photo_url TEXT,
  photo_expires_at TIMESTAMPTZ,

  -- Only one completion per routine per day
  UNIQUE(routine_id, date)
);

-- Paper inventory table
-- Tracks printed vs used cards for inventory management
CREATE TABLE paper_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL UNIQUE REFERENCES routines(id) ON DELETE CASCADE,
  printed_count INT NOT NULL DEFAULT 0,
  uploaded_count INT NOT NULL DEFAULT 0,
  alert_threshold INT NOT NULL DEFAULT 5,
  last_alert_sent_at TIMESTAMPTZ,
  last_printed_at TIMESTAMPTZ
);

-- Edit history table
-- Tracks edits to completed routines for audit purposes
CREATE TABLE edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completed_routine_id UUID NOT NULL REFERENCES completed_routines(id) ON DELETE CASCADE,
  previous_values JSONB NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_routine_versions_routine_id ON routine_versions(routine_id);
CREATE INDEX idx_completed_routines_routine_id ON completed_routines(routine_id);
CREATE INDEX idx_completed_routines_date ON completed_routines(date DESC);
CREATE INDEX idx_completed_routines_routine_date ON completed_routines(routine_id, date DESC);
CREATE INDEX idx_completed_routines_photo_expires ON completed_routines(photo_expires_at) WHERE photo_expires_at IS NOT NULL;
CREATE INDEX idx_edit_history_completed_routine_id ON edit_history(completed_routine_id);

-- Function to update modified_at timestamp
CREATE OR REPLACE FUNCTION update_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update modified_at on routines
CREATE TRIGGER trigger_routines_modified_at
  BEFORE UPDATE ON routines
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_at();
