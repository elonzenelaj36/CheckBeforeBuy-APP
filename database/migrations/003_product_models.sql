-- ============================================================================
-- Migration: 3D models of product photos (room visualization)
--
-- Adds a NEW table `product_models` (a fresh install gets it from schema.sql).
-- One row per user + product photo, so a photo is only ever sent for 3D
-- generation once; the row tracks the provider task and the stored GLB.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS). Does not touch existing tables.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/migrations/003_product_models.sql
-- ============================================================================

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
