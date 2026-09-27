-- ============================================================================
-- Migration: camera pitch per captured room view
--
-- Adds a nullable `pitch_deg` column to `room_capture_frames`: how far the
-- phone's camera looked below the horizon for that view (from gravity while
-- recording; + = looking down). 3D products are rendered from the matching
-- up/down perspective. NULL = recorded before this column existed (treated as
-- a level camera). A fresh install gets it from schema.sql.
--
-- Safe to re-run (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS). Touches no other table.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/006_room_capture_frame_pitch.sql
-- ============================================================================

SET @has_pitch := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room_capture_frames' AND COLUMN_NAME = 'pitch_deg'
);
SET @sql := IF(
  @has_pitch = 0,
  'ALTER TABLE room_capture_frames ADD COLUMN pitch_deg FLOAT NULL AFTER brightness',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
