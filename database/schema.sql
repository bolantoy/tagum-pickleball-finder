-- ─── Tagum Pickleball Finder — Supabase Schema ────────────────────────────────
-- Run this in your Supabase SQL editor to create the courts table.
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor

-- ── Enable UUID generation ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Courts Table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  website     TEXT,
  phone       TEXT,
  facebook    TEXT,
  image       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  parser_name TEXT,    -- matches parsers/index.ts registry keys
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Index for active courts ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courts_active ON courts (active);
CREATE INDEX IF NOT EXISTS idx_courts_parser_name ON courts (parser_name);

-- ── Auto-update updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_courts_updated_at
  BEFORE UPDATE ON courts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── Row Level Security (optional but recommended) ──────────────────────────
-- Allow public read access (the mobile app reads courts without auth)
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public courts are viewable by everyone"
  ON courts FOR SELECT
  USING (active = true);

-- Only service role (your backend) can insert/update/delete
CREATE POLICY "Service role full access"
  ON courts FOR ALL
  USING (auth.role() = 'service_role');
