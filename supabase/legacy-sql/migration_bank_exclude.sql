-- Add exclude_from_stats column to banks table
ALTER TABLE banks ADD COLUMN IF NOT EXISTS exclude_from_stats BOOLEAN DEFAULT false;
