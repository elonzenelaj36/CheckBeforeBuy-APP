-- ============================================================================
-- Check Before Buy — MySQL schema
--
-- Creates every table used by the backend (backend/src/db). Run this once
-- against a fresh `check_before_buy` database. Safe to re-run: tables are
-- created with IF NOT EXISTS, but on a real re-run you'd normally DROP first.
--
-- Usage:
--   mysql -u root -p
--   CREATE DATABASE check_before_buy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE check_before_buy;
--   SOURCE database/schema.sql;
--
-- Or, from a shell:
--   mysql -u root -p check_before_buy < database/schema.sql
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── users ───────────────────────────────────────────────────────────────────
-- One row per registered account. Passwords are always stored hashed
-- (bcrypt) — the backend never writes or reads plain-text passwords.
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120)    NOT NULL,
  email         VARCHAR(190)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── products ────────────────────────────────────────────────────────────────
-- A canonical product record. Created either from a product check (AI
-- recognition) or manually when a user saves something. Multiple users can
-- reference the same product row via saved_products / product_checks.
CREATE TABLE IF NOT EXISTS products (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(255)    NOT NULL,
  category         VARCHAR(120)    NULL,
  brand            VARCHAR(120)    NULL,
  description      TEXT            NULL,
  estimated_price  DECIMAL(10,2)   NULL,
  currency         CHAR(3)         NOT NULL DEFAULT 'EUR',
  image_path       VARCHAR(500)    NULL,
  created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_products_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── rooms ───────────────────────────────────────────────────────────────────
-- A room belonging to a user (e.g. "Master Bedroom"). The primary photo is
-- tracked on room_photos.is_primary rather than a column here, so there is
-- no circular foreign key between rooms and room_photos.
CREATE TABLE IF NOT EXISTS rooms (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(150)    NOT NULL,
  room_type   VARCHAR(50)     NOT NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rooms_user (user_id),
  CONSTRAINT fk_rooms_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── room_photos ─────────────────────────────────────────────────────────────
-- Multiple photos per room. Exactly one photo per room should have
-- is_primary = TRUE; the backend enforces that in application code.
CREATE TABLE IF NOT EXISTS room_photos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id     BIGINT UNSIGNED NOT NULL,
  image_path  VARCHAR(500)    NOT NULL,
  is_primary  BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_room_photos_room (room_id),
  CONSTRAINT fk_room_photos_room
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── room_captures / room_capture_frames ──────────────────────────────────────
-- Optional 180°/360° room sweep and the viewpoints extracted from it.
-- mode         : range the user chose when recording.
-- angle_source : 'gyro' = frame angles come from the phone's rotation sensor;
--                'time' = no usable rotation data, angles assume a steady turn.
-- lens         : camera lens that recorded it ('ultra-wide' = 0.5×); NULL = 'wide' (1×).
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
  lens               ENUM('wide', 'ultra-wide') NULL,
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

-- ── user_items ──────────────────────────────────────────────────────────────
-- Things the user already owns. Populated automatically by AI room analysis
-- (see backend/src/services/aiService.js#analyzeRoomImages) when a room's
-- photos are analyzed; `source` records whether a row came from that or from
-- the (legacy) manual-entry endpoint. Used to compare a newly checked
-- product against what the user already has, and to power Find for My Home.
CREATE TABLE IF NOT EXISTS user_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  room_id     BIGINT UNSIGNED NULL,
  name        VARCHAR(255)    NOT NULL,
  category    VARCHAR(120)    NOT NULL DEFAULT 'Other',
  description TEXT            NULL,
  image_path  VARCHAR(500)    NULL,
  source      ENUM('manual', 'ai') NOT NULL DEFAULT 'manual',
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_items_user (user_id),
  KEY idx_user_items_room (room_id),
  CONSTRAINT fk_user_items_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_items_room
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── product_checks ──────────────────────────────────────────────────────────
-- Every product analysis a user runs. This is the core AI-analysis record
-- and doubles as the data source for the "History" screen.
CREATE TABLE IF NOT EXISTS product_checks (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id               BIGINT UNSIGNED NOT NULL,
  product_id            BIGINT UNSIGNED NULL,
  image_path            VARCHAR(500)    NOT NULL,
  detected_name         VARCHAR(255)    NULL,
  detected_category     VARCHAR(120)    NULL,
  detected_brand        VARCHAR(120)    NULL,
  description           TEXT            NULL,
  estimated_price       DECIMAL(10,2)   NULL,
  estimated_price_min   DECIMAL(10,2)   NULL,
  estimated_price_max   DECIMAL(10,2)   NULL,
  currency              CHAR(3)         NOT NULL DEFAULT 'EUR',
  user_price            DECIMAL(10,2)   NULL,
  price_assessment      ENUM('fair', 'good_deal', 'overpriced', 'unknown') NOT NULL DEFAULT 'unknown',
  recommendation        ENUM('buy', 'consider', 'skip', 'unknown') NOT NULL DEFAULT 'unknown',
  confidence             DECIMAL(4,3)   NULL,
  ai_provider            VARCHAR(50)    NULL,
  ai_model                VARCHAR(80)    NULL,
  ai_raw_response        JSON           NULL,
  is_mock                 BOOLEAN        NOT NULL DEFAULT FALSE,
  has_visualization       BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_checks_user (user_id),
  KEY idx_product_checks_product (product_id),
  KEY idx_product_checks_created (created_at),
  CONSTRAINT fk_product_checks_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_checks_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── saved_products ──────────────────────────────────────────────────────────
-- Many-to-many: a user "saving" a product for later reference.
--
-- product_check_id is an OPTIONAL back-reference to the product_checks row
-- this save came from (when the user saved a product they'd just captured
-- or that they opened from History). It's nullable because a product can in
-- principle be saved without ever having gone through a check (e.g. a future
-- "save from search/catalog" flow). It exists so that a name change made on
-- the product_checks/History side can be recognized as the same underlying
-- product as its Saved Products entry — both point at the same `products`
-- row via product_id, and product_check_id makes that relationship explicit
-- and queryable.
CREATE TABLE IF NOT EXISTS saved_products (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  product_id        BIGINT UNSIGNED NOT NULL,
  product_check_id  BIGINT UNSIGNED NULL,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saved_products_user_product (user_id, product_id),
  KEY idx_saved_products_user (user_id),
  KEY idx_saved_products_product_check (product_check_id),
  CONSTRAINT fk_saved_products_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_products_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_products_product_check
    FOREIGN KEY (product_check_id) REFERENCES product_checks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── generated_images ────────────────────────────────────────────────────────
-- AI room-visualization results (product placed inside a room photo).
CREATE TABLE IF NOT EXISTS generated_images (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                   BIGINT UNSIGNED NOT NULL,
  room_id                   BIGINT UNSIGNED NOT NULL,
  product_check_id          BIGINT UNSIGNED NULL,
  product_name              VARCHAR(255)    NULL,
  source_room_image_path    VARCHAR(500)    NULL,
  source_product_image_path VARCHAR(500)    NULL,
  generated_image_path      VARCHAR(500)    NULL,
  status                    ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  provider                  VARCHAR(50)     NULL,
  layout_json               JSON            NULL,
  created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_generated_images_user (user_id),
  KEY idx_generated_images_room (room_id),
  CONSTRAINT fk_generated_images_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_generated_images_room
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_generated_images_product_check
    FOREIGN KEY (product_check_id) REFERENCES product_checks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── product_models ──────────────────────────────────────────────────────────
-- AI-generated 3D models (GLB) of product photos, used as the 3D version of a
-- product in room visualizations. One row per user + product photo
-- (source_hash = the background-removed cutout's content hash), so the same
-- photo is never sent for 3D generation twice.
CREATE TABLE IF NOT EXISTS product_models (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  source_hash       CHAR(32)        NOT NULL,
  status            ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
  provider          VARCHAR(50)     NOT NULL,
  provider_task_id  VARCHAR(100)    NULL,
  provider_status   VARCHAR(20)     NULL,
  progress          TINYINT UNSIGNED NULL,
  model_path        VARCHAR(500)    NULL,
  error_message     VARCHAR(500)    NULL,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_models_source (user_id, source_hash),
  CONSTRAINT fk_product_models_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── price_history ───────────────────────────────────────────────────────────
-- Historical price points for a product, recorded whenever an AI check (or
-- a user) reports a price for it. Lets us later show price trends.
CREATE TABLE IF NOT EXISTS price_history (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id   BIGINT UNSIGNED NOT NULL,
  price        DECIMAL(10,2)   NOT NULL,
  currency     CHAR(3)         NOT NULL DEFAULT 'EUR',
  source       VARCHAR(100)    NULL,
  recorded_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_price_history_product (product_id),
  CONSTRAINT fk_price_history_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
