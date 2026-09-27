-- ============================================================================
-- Migration: which camera lens recorded a room capture
--
-- Adds a nullable `lens` column to `room_captures` (a fresh install gets it
-- from schema.sql). NULL = recorded before this column existed, treated as
-- the normal 1× 'wide' lens. The lens decides the capture's frame spacing and
-- turning-speed limits (ultra-wide sees ~75° across in portrait vs ~42°).
--
-- Safe to re-run: the column is only added when it doesn't exist yet
-- (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS). Touches no other table.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/005_room_capture_lens.sql
-- ============================================================================

SET @has_lens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room_captures' AND COLUMN_NAME = 'lens'
);
SET @sql := IF(
  @has_lens = 0,
  "ALTER TABLE room_captures ADD COLUMN lens ENUM('wide', 'ultra-wide') NULL AFTER angle_source",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
