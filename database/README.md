# Database — Check Before Buy

MySQL database for the Check Before Buy backend. Database name: **`check_before_buy`**.

## Create the database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE check_before_buy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Recommended: a dedicated app user instead of using root from the backend.
CREATE USER 'check_before_buy_app'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT ALL PRIVILEGES ON check_before_buy.* TO 'check_before_buy_app'@'localhost';
FLUSH PRIVILEGES;

EXIT;
```

## Import the schema

```bash
mysql -u root -p check_before_buy < database/schema.sql
```

This creates all tables (`users`, `products`, `saved_products`, `product_checks`,
`rooms`, `room_photos`, `user_items`, `generated_images`, `price_history`) with
proper primary keys, foreign keys, and indexes. See `schema.sql` for full
column definitions and relationships.

## Upgrading an existing database

If you already ran `schema.sql` before `user_items` gained `description` and
`source` columns (used by AI room-detection — see backend README → "AI room
analysis"), apply the migration once:

```bash
mysql -u root -p check_before_buy < database/migrations/001_user_items_ai_detection.sql
```

It's safe to re-run and never touches existing rows — a fresh `schema.sql`
import already includes these columns, so new installs can skip this step.

## (Optional) Load demo seed data

```bash
mysql -u root -p check_before_buy < database/seed.sql
```

This inserts one demo user and a couple of sample products/rooms so you can
explore the API without registering a real account first. **No real
passwords are stored** — see the comment at the top of `seed.sql` for the
demo login credentials (a fixed bcrypt hash for a documented demo password,
intended for local development only).

## Point the backend at this database

In `backend/.env` (copied from `backend/.env.example`):

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=check_before_buy
DB_USER=check_before_buy_app
DB_PASSWORD=change-this-password
```

## Tables and relationships

```text
users
  └─< saved_products >─ products
  │       └──────────>─ product_checks (optional)
  └─< product_checks >─ products (optional)
  └─< rooms
  │     └─< room_photos
  │     └─< user_items (optional room_id)
  │     └─< generated_images >─ product_checks (optional)
  └─< user_items
  └─< generated_images

products
  └─< price_history
```

`saved_products.product_check_id` (nullable FK → `product_checks.id`) links a
saved product back to the check it came from, when there is one. It exists
so that renaming a product from the History side (`PATCH
/api/product-checks/:id`, which updates the shared `products.name`) and
saving a fresh capture (`POST /api/saved-products`, which — when there's no
existing check to link to — creates both the `products` row *and* a
matching `product_checks` row) both end up pointing at the **same**
`products` row instead of silently creating two unrelated product records
for what the user experiences as one checked product.

- `saved_products` and `generated_images` are many-to-one against `users`
  and reference `products` / `rooms` respectively.
- `room_photos.is_primary` marks the thumbnail photo for a room (enforced by
  the backend, not by a database constraint).
- `product_checks` is the record of every AI product analysis; `is_mock`
  distinguishes demo/mock analyses from real AI-provider results.
- `generated_images.status` tracks the lifecycle of a room visualization
  (`pending` → `completed`/`failed`) since image generation is async and may
  not be fully configured (see backend README).
- `user_items.source` distinguishes `'ai'` (written by room analysis) from
  `'manual'` (the historical default) rows.

## Verifying manually

```sql
USE check_before_buy;
SHOW TABLES;
DESCRIBE product_checks;
```

phpMyAdmin works fine for browsing/editing this database if you prefer a GUI
— just point it at the same host/user/password.
