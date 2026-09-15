-- ============================================================================
-- Migration: add AI room-detection support to user_items
--
-- Adds two columns to an EXISTING `user_items` table (a fresh install gets
-- them directly from schema.sql instead):
--   - description : short factual text about the detected object (nullable)
--   - source      : 'manual' (typed in by a user, the historical default) or
--                    'ai' (written by room analysis). Defaults to 'manual' so
--                    every existing row is classified correctly with no data
--                    loss or reinterpretation needed.
--
-- Safe to re-run: each ALTER is guarded by an information_schema check and
-- only runs if the column doesn't already exist. Does not drop or modify any
-- existing data.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/001_user_items_ai_detection.sql
-- ============================================================================

SET @db := DATABASE();

SET @add_description := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE user_items ADD COLUMN description TEXT NULL AFTER category',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_items' AND COLUMN_NAME = 'description'
);
PREPARE stmt FROM @add_description;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_source := (
  SELECT IF(
    COUNT(*) = 0,
    "ALTER TABLE user_items ADD COLUMN source ENUM('manual', 'ai') NOT NULL DEFAULT 'manual' AFTER image_path",
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_items' AND COLUMN_NAME = 'source'
);
PREPARE stmt FROM @add_source;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
