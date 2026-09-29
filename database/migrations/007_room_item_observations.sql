-- ============================================================================
-- Migration: where detected room items were seen
--
-- Adds a NEW table `room_item_observations` (a fresh install gets it from
-- schema.sql). A detected item is still one `user_items` row (source = 'ai',
-- the user's inventory); each observation says where it was seen:
--   - photo rooms: a box on the room photo (room_photo_id)
--   - 180°/360° rooms: a box on one captured view (capture_frame_id), plus the
--     room direction range it covers — several views of the same sofa are
--     several observations of ONE item.
-- Boxes are normalized 0..1 on that image. No 3D coordinates are stored or
-- implied: this is "which picture, which box".
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS). Does not touch existing tables.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/007_room_item_observations.sql
-- ============================================================================

-- direction_deg / half_width_deg : spatial rooms only — the room direction of
--   the box centre and half its angular width (same angle scale as the
--   capture's frames), used to merge repeated sightings and to follow the item
--   while the user turns the room. NULL for photo rooms.
CREATE TABLE IF NOT EXISTS room_item_observations (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_item_id      BIGINT UNSIGNED NOT NULL,
  room_photo_id     BIGINT UNSIGNED NULL,
  capture_frame_id  BIGINT UNSIGNED NULL,
  box_x1            FLOAT           NOT NULL,
  box_y1            FLOAT           NOT NULL,
  box_x2            FLOAT           NOT NULL,
  box_y2            FLOAT           NOT NULL,
  confidence        FLOAT           NULL,
  direction_deg     FLOAT           NULL,
  half_width_deg    FLOAT           NULL,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_room_item_obs_item (user_item_id),
  CONSTRAINT fk_room_item_obs_item
    FOREIGN KEY (user_item_id) REFERENCES user_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_item_obs_photo
    FOREIGN KEY (room_photo_id) REFERENCES room_photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_item_obs_frame
    FOREIGN KEY (capture_frame_id) REFERENCES room_capture_frames(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
