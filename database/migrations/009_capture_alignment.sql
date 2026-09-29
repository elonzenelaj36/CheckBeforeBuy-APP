-- ============================================================================
-- Migration: picture-checked angles and field of view for room captures
--
-- Adds (all nullable, NULL = not aligned / captured before this existed):
--   room_captures.fov_deg              horizontal field of view measured from
--                                      the views themselves (e.g. 0.5× lens ≈ 60°)
--   room_capture_frames.gyro_angle_deg the rotation sensor's original angle; angle_deg
--                                      then holds the picture-corrected angle
--   room_capture_frames.align_score    how well this view lines up with the next
--                                      one (0..1; 0 = they don't match → viewer snaps)
-- See backend/src/services/captureAlignmentService.js. A fresh install gets
-- these from schema.sql.
--
-- Safe to re-run (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS). Touches no other table.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/009_capture_alignment.sql
-- ============================================================================

SET @has_fov := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room_captures' AND COLUMN_NAME = 'fov_deg'
);
SET @sql := IF(
  @has_fov = 0,
  'ALTER TABLE room_captures ADD COLUMN fov_deg FLOAT NULL AFTER lens',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_gyro := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room_capture_frames' AND COLUMN_NAME = 'gyro_angle_deg'
);
SET @sql := IF(
  @has_gyro = 0,
  'ALTER TABLE room_capture_frames ADD COLUMN gyro_angle_deg DECIMAL(6,2) NULL AFTER angle_deg, ADD COLUMN align_score FLOAT NULL AFTER pitch_deg',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
