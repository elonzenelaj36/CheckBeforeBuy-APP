-- ============================================================================
-- Migration: color and material of detected room items
--
-- Adds nullable `color` and `material` columns to `user_items`. Items Detected
-- fills them (e.g. "dark brown", "wood") so Analyze Product can say whether a
-- product matches what is already in the room. NULL = unknown / detected
-- before this column existed (re-run DETECT ITEMS to fill it). A fresh install
-- gets them from schema.sql.
--
-- Safe to re-run (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS). Touches no other table.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/008_user_item_color_material.sql
-- ============================================================================

SET @has_color := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_items' AND COLUMN_NAME = 'color'
);
SET @sql := IF(
  @has_color = 0,
  'ALTER TABLE user_items ADD COLUMN color VARCHAR(60) NULL AFTER description, ADD COLUMN material VARCHAR(60) NULL AFTER color',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
