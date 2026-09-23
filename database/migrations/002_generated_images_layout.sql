-- ============================================================================
-- Migration: store the visualization product layout with a generated image
--
-- Adds one nullable column to an EXISTING `generated_images` table (a fresh
-- install gets it directly from schema.sql instead):
--   - layout_json : room + products + each product's position, size,
--                   rotation and layer order, saved from the Visualization
--                   screen's SAVE button. NULL for older rows.
--
-- Safe to re-run: the ALTER is guarded by an information_schema check and
-- only runs if the column doesn't already exist. Does not modify existing data.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/002_generated_images_layout.sql
-- ============================================================================

SET @db := DATABASE();

SET @add_layout := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE generated_images ADD COLUMN layout_json JSON NULL AFTER provider',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'generated_images' AND COLUMN_NAME = 'layout_json'
);
PREPARE stmt FROM @add_layout;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
