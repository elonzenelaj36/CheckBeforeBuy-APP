-- ============================================================================
-- Migration: optional spatial room capture (180° / 360° room views)
--
-- Adds two NEW tables (a fresh install gets them from schema.sql):
--   room_captures        — one recorded room sweep, attached to a room
--   room_capture_frames  — the viewpoints extracted from that sweep
--
-- A room without a capture works exactly as before: rooms and room_photos
-- are not touched, and the room's photos (primary photo included) stay as
-- they are. The capture is extra, optional data.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS). Does not touch existing tables.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/004_room_captures.sql
-- ============================================================================

-- mode         : range the user chose when recording.
-- angle_source : 'gyro' = frame angles come from the phone's rotation sensor;
--                'time' = no usable rotation data, angles assume a steady turn.
-- coverage_deg : how far the user actually turned (gyro), or the chosen range (time).
-- loops        : true only for a 360° capture whose full turn the gyro confirmed.
-- selected_frame_id : the view the user picked with "USE THIS VIEW" (NULL =
--                use the room's primary photo). No FK, to avoid a cycle with
--                room_capture_frames; the backend checks it belongs to this capture.
CREATE TABLE IF NOT EXISTS room_captures (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id            BIGINT UNSIGNED NOT NULL,
  mode               ENUM('180', '360') NOT NULL,
  angle_source       ENUM('gyro', 'time') NOT NULL,
  coverage_deg       DECIMAL(6,1)    NOT NULL,
  loops              BOOLEAN         NOT NULL DEFAULT FALSE,
  frame_count        INT UNSIGNED    NOT NULL,
  video_duration_ms  INT UNSIGNED    NOT NULL,
  warnings           JSON            NULL,
  selected_frame_id  BIGINT UNSIGNED NULL,
  created_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_room_captures_room (room_id),
  CONSTRAINT fk_room_captures_room
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per viewpoint, ordered by angle (frame_index 0 = start of the sweep).
-- image_path   : full-size frame (longest side ≤ 1280px) — what Arrange / AI Render use.
-- preview_path : small copy (≤ 640px) for swiping.
CREATE TABLE IF NOT EXISTS room_capture_frames (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  capture_id     BIGINT UNSIGNED NOT NULL,
  frame_index    INT UNSIGNED    NOT NULL,
  angle_deg      DECIMAL(6,2)    NOT NULL,
  video_time_ms  INT UNSIGNED    NOT NULL,
  sharpness      FLOAT           NOT NULL,
  brightness     FLOAT           NOT NULL,
  image_path     VARCHAR(500)    NOT NULL,
  preview_path   VARCHAR(500)    NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_room_capture_frames_index (capture_id, frame_index),
  CONSTRAINT fk_room_capture_frames_capture
    FOREIGN KEY (capture_id) REFERENCES room_captures(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
