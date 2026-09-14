-- ============================================================================
-- Check Before Buy — development seed data
--
-- Optional. Inserts one demo account and a couple of sample rows so you can
-- explore the API/app without registering first.
--
-- Demo login (LOCAL DEVELOPMENT ONLY — do not reuse this password anywhere):
--   email:    demo@checkbeforebuy.dev
--   password: DemoPass123!
--
-- The hash below is bcrypt("DemoPass123!", 10 rounds). No plain-text
-- password is stored anywhere in this file or the database.
--
-- Usage:
--   mysql -u root -p check_before_buy < database/seed.sql
-- ============================================================================

INSERT INTO users (name, email, password_hash)
VALUES ('Demo User', 'demo@checkbeforebuy.dev', '$2a$10$U/cWBEP8r9uwvQ.aQsnuU.3shoJEnOEoYhm.uKwY/Y4EZjijcWCS6')
ON DUPLICATE KEY UPDATE name = VALUES(name);

SET @demo_user_id = (SELECT id FROM users WHERE email = 'demo@checkbeforebuy.dev');

-- Sample products (no images — image_path is NULL, mobile UI shows a
-- placeholder for products without a photo).
INSERT INTO products (name, category, brand, description, estimated_price, currency)
VALUES
  ('Nordic Lounge Chair', 'Furniture', 'HomeLine', 'A minimalist lounge chair with a light wood frame and fabric cushion.', 189.99, 'EUR'),
  ('Modern Oak Table', 'Furniture', 'WoodCraft', 'A solid oak dining table with a natural finish.', 329.99, 'EUR');

SET @chair_id = (SELECT id FROM products WHERE name = 'Nordic Lounge Chair' LIMIT 1);
SET @table_id = (SELECT id FROM products WHERE name = 'Modern Oak Table' LIMIT 1);

INSERT INTO saved_products (user_id, product_id)
VALUES (@demo_user_id, @chair_id)
ON DUPLICATE KEY UPDATE created_at = created_at;

INSERT INTO price_history (product_id, price, currency, source)
VALUES
  (@chair_id, 199.99, 'EUR', 'ai_estimate'),
  (@chair_id, 189.99, 'EUR', 'ai_estimate'),
  (@table_id, 349.99, 'EUR', 'ai_estimate');

-- A sample room (no photo — the app shows a placeholder).
INSERT INTO rooms (user_id, name, room_type)
VALUES (@demo_user_id, 'Living Room', 'Living Room');

SET @room_id = (SELECT id FROM rooms WHERE user_id = @demo_user_id AND name = 'Living Room' LIMIT 1);

INSERT INTO user_items (user_id, room_id, name, category)
VALUES (@demo_user_id, @room_id, 'Grey Fabric Sofa', 'Furniture');
