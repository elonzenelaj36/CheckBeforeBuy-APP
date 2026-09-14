# Check Before Buy

## Overview

Check Before Buy is a mobile app (React Native / Expo) that helps you decide
whether to buy something. You spot a product somewhere, take a photo, and
the app tells you what it is, roughly what it should cost, and whether it
looks like a good purchase — backed by a real Node.js/Express + MySQL
backend and Anthropic's Claude vision AI for product analysis.

## Core idea

> **See it → Check it → Understand it → Decide**

1. **See it** — you're in a store, or somewhere, and spot a product.
2. **Check it** — take a photo (or pick one) in the app.
3. **Understand it** — the backend sends the photo to an AI vision model
   and returns what it is, an estimated price range, and whether the price
   (if you gave one) looks fair.
4. **Decide** — buy, consider, or skip — with the reasoning shown, not just
   a number.

You can also save products, log rooms in your home with photos, log items
you already own, and (once an image-generation provider is configured)
preview a product placed inside one of your rooms.

## Features

### Implemented
- Email/password registration and login (JWT, bcrypt-hashed passwords)
- Real AI product analysis via Anthropic Claude vision (`POST /api/product-checks`) — structured JSON, honest about uncertainty (never invents a price it can't justify)
- Product check history, backed by MySQL, per user
- Rooms: create/edit/delete, multiple photos per room, primary photo
- Saved products (save/unsave, persisted server-side)
- Items you already own (used as context for AI analysis, to flag redundant purchases)
- Room-visualization request flow end-to-end (upload, persistence, status tracking) — see "In progress" for the image itself
- Centralized API client with auth token handling, loading/error states across the main flows
- Bottom navigation on all primary destinations (Home, Search, My Home, My Items, Saved, History, Recommendations, Profile, Settings, Room Detail)

### In progress
- **AI room visualization image generation.** The backend has the full
  request/response contract and persists every request, but returns
  `status: "pending"` until an image-generation provider is configured
  (see `backend/README.md` → "AI — room visualization"). No fake image is
  ever shown in its place.
- Personalized recommendations ("Recommended for you" on Home is
  explicitly marked "Coming soon").

### Mock/prototype
- The **Search** screen and **Recommendations** screen browse a small
  static in-memory product list (`src/services/products.ts`), not real
  store inventory.
- **Alternatives / Comparison / Price history / Product info / Find for my
  home** screens are still UI prototypes with placeholder content — they
  aren't wired to the backend.
- "Continue with Google" on the login screen is decorative (no OAuth
  provider configured).

### Planned
See "Roadmap" below.

## Architecture

```text
React Native Expo (src/)
        │  HTTP / REST (JSON + multipart for images)
        ▼
Node.js / Express (backend/)
        │
        ├──────────────► MySQL (check_before_buy)
        │
        └──────────────► Anthropic Claude API (product analysis)
                          [image-generation provider — not yet configured]
```

```text
Screen  →  Service (src/services/*.ts)  →  API client (src/services/api.ts)  →  Express route  →  Controller  →  MySQL / AI service
```

## Project structure

```text
check-before-buy/
├── src/
│   ├── app/                 # expo-router screens (file-based routing)
│   ├── components/          # BottomNavigation, ScreenHeader, EmptyState, ...
│   ├── constants/           # colors.ts (design tokens), config.ts
│   └── services/            # api.ts, auth.ts, rooms.ts, productChecks.ts, ...
├── backend/
│   └── src/                 # Express app — see backend/README.md
├── database/
│   ├── schema.sql           # full MySQL schema
│   ├── seed.sql             # optional demo data
│   └── README.md            # how to create the database
├── app.json                 # Expo config (extra.apiUrl = backend base URL)
└── README.md                 # this file
```

## Frontend screens

| Route | Purpose |
|---|---|
| `/` (index) | Welcome screen; auto-redirects to `/home` if a session is restored |
| `/onboarding`, `/login`, `/signup` | Auth flow (no bottom nav) |
| `/home` | Main dashboard — check CTA, recent history |
| `/search` | Browse the mock product list |
| `/check-product` | Camera/gallery capture |
| `/product-captured` | Name the captured product, choose analyze or visualize |
| `/product-analysis` | Real AI analysis result |
| `/decision` | Buy/consider/skip verdict, built from the real analysis |
| `/my-home`, `/add-room`, `/room-detail` | Room management (backend-backed) |
| `/select-room`, `/capture-room`, `/visualization` | Room-visualization flow |
| `/my-items` | Items you own |
| `/saved` | Saved products + saved visualizations |
| `/history` | Full check history |
| `/profile`, `/settings`, `/notifications` | Account screens |

## Backend

See **`backend/README.md`** for full details. Short version: Express app
with `controllers/`, `routes/`, `services/` (AI + image generation),
`middleware/` (auth, upload, errors), and `db/connection.js` (a `mysql2`
pool). Every resource route requires a valid JWT and scopes queries to the
authenticated user.

## Database

- **Database name:** `check_before_buy`
- **Tables:** `users`, `products`, `saved_products`, `product_checks`,
  `rooms`, `room_photos`, `user_items`, `generated_images`, `price_history`
- Full schema, relationships, and setup instructions: **`database/README.md`**
  and **`database/schema.sql`**.

## Authentication

- `POST /api/auth/register` and `POST /api/auth/login` return a JWT.
- The mobile app stores the token in AsyncStorage (`src/services/auth.ts`)
  and attaches it as `Authorization: Bearer <token>` to every request via
  `src/services/api.ts`.
- Passwords are bcrypt-hashed server-side; plain-text passwords are never
  stored, logged, or returned.

## AI

- **Product analysis:** Anthropic Claude (vision-capable model, default
  `claude-sonnet-5`), called from `backend/src/services/aiService.js` using
  tool-use for guaranteed structured JSON output. **Fully implemented**,
  gated on `AI_API_KEY` — without it, requests still work end-to-end but
  return a clearly-marked mock result explaining that AI isn't configured.
- **Room-image generation:** abstraction and API contract are implemented
  (`backend/src/services/imageGenerationService.js`,
  `POST /api/generated-images`), but **no provider is wired up** — Claude
  doesn't generate images, and picking a separate image-generation provider
  is a deliberate choice left for later (see `backend/README.md`). Requests
  are saved with `status: "pending"` and the mobile UI shows that honestly.

## Local development

```bash
# 1. MySQL — create the database (see database/README.md for full commands)
mysql -u root -p
#   CREATE DATABASE check_before_buy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
mysql -u root -p check_before_buy < database/schema.sql
mysql -u root -p check_before_buy < database/seed.sql   # optional demo data

# 2. Backend
cd backend
npm install
cp .env.example .env   # fill in DB_*, JWT_SECRET, AI_API_KEY
npm run dev

# 3. Mobile app (in a separate terminal, from the repo root)
npm install
npx expo start
```

Or, from the repo root: `npm run backend` / `npm run mobile`.

**Physical device note:** `http://localhost:5000` only resolves on the
same machine. Testing on a physical phone requires setting
`extra.apiUrl` in `app.json` (or `EXPO_PUBLIC_API_URL`) to your computer's
LAN IP, e.g. `http://192.168.1.23:5000/api`.

## Environment variables

- **Mobile** (`app.json` → `expo.extra.apiUrl`): only the backend base URL.
  No secrets ever live in the mobile bundle.
- **Backend** (`backend/.env`, gitignored): `DB_*`, `JWT_SECRET`,
  `AI_API_KEY` / `AI_MODEL`, `IMAGE_AI_PROVIDER` / `IMAGE_AI_API_KEY`,
  `UPLOAD_DIR`, `PUBLIC_BASE_URL`. See `backend/.env.example` for the full,
  documented list.

## API endpoints

Full table in `backend/README.md`. Summary:

```text
POST   /api/auth/register            POST   /api/rooms
POST   /api/auth/login               PUT    /api/rooms/:id
GET    /api/users/me                 DELETE /api/rooms/:id
                                      POST   /api/rooms/:id/photos
POST   /api/product-checks           DELETE /api/rooms/:id/photos/:photoId
GET    /api/product-checks           PATCH  /api/rooms/:id/photos/:photoId
GET    /api/product-checks/:id
DELETE /api/product-checks           GET    /api/saved-products
GET    /api/history                  POST   /api/saved-products
                                      DELETE /api/saved-products/:id
GET    /api/items
POST   /api/items                    GET    /api/generated-images
PUT    /api/items/:id                GET    /api/generated-images/room/:roomId
DELETE /api/items/:id                POST   /api/generated-images
                                      DELETE /api/generated-images/:id
```

## Testing

```bash
# Mobile — TypeScript
npx tsc --noEmit        # 0 errors

# Mobile — lint
npx expo lint

# Backend — manual endpoint testing
# see backend/README.md → "Manual testing" for a full curl walkthrough
```

There is no automated backend test suite yet (see Roadmap).

## Roadmap

- Real store price comparison / price history charts (the `price_history`
  table already exists — needs a real pricing source and UI)
- A real AI image-generation provider for room visualization
- Better product recognition (multi-photo, barcode/OCR assist)
- Personalized recommendations using `user_items` + check history
- Cloud image storage (S3/Cloudinary/etc.) instead of local disk
- Automated backend tests
- Analytics / usage data pipeline
- Store/business integrations for live pricing
