# Check Before Buy — Backend

Node.js/Express REST API backing the Check Before Buy mobile app. Talks to
MySQL for persistence and to Anthropic's Claude API for product analysis.

## Structure

```text
backend/
├── src/
│   ├── config/env.js         # loads & validates environment variables
│   ├── db/connection.js      # mysql2 connection pool
│   ├── middleware/           # auth (JWT), upload (multer), error handling
│   ├── controllers/          # request handlers, one per resource
│   ├── routes/                # Express routers, mounted under /api
│   ├── services/
│   │   ├── aiService.js               # product analysis (Anthropic Claude, vision)
│   │   └── imageGenerationService.js  # room visualization (NOT configured — see below)
│   ├── utils/                # ApiError, asyncHandler, password/token/validate helpers
│   ├── app.js                 # Express app assembly
│   └── server.js              # entrypoint — connects to MySQL, then listens
├── uploads/                   # local image storage (dev only, gitignored)
├── .env.example
└── package.json
```

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `DB_*` — point at your MySQL database (see `../database/README.md` to
  create it first).
- `JWT_SECRET` — generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `AI_API_KEY` / `AI_MODEL` — see "AI — product analysis" below. Optional:
  the server runs in a clearly-labeled mock mode without it.

## Run

```bash
npm run dev   # auto-restarts on file changes (node --watch)
# or
npm start
```

On boot the server tests the MySQL connection first and exits with a clear
error if it can't connect — it will not silently start in a broken state.
On success you'll see:

```text
[db] Connected to MySQL database "check_before_buy" at localhost:3306
[server] Check Before Buy API listening on http://localhost:5000
[server] AI product analysis: enabled (claude-sonnet-5)
[server] Room visualization AI: NOT CONFIGURED (set IMAGE_AI_PROVIDER)
```

## Authentication

- `POST /api/auth/register` `{ name, email, password }` → `{ user, token }`
- `POST /api/auth/login` `{ email, password }` → `{ user, token }`
- Passwords are hashed with bcrypt (`bcryptjs`, 10 rounds) — never stored or
  logged in plain text.
- Tokens are JWTs (`jsonwebtoken`), signed with `JWT_SECRET`, sent as
  `Authorization: Bearer <token>`. `middleware/auth.js` verifies the token
  and attaches `req.user = { id, email }`.
- Every resource route below requires auth and scopes all reads/writes to
  `req.user.id` — one user can never read or modify another user's rows
  (enforced with `WHERE user_id = ?` on every query, and ownership checks
  before touching related rows like room photos).

## API endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Get a token |
| GET | `/api/users/me` | Current user's profile |
| POST | `/api/product-checks` | Upload a product photo → AI analysis → stored result |
| GET | `/api/product-checks` | List the user's product checks |
| GET | `/api/product-checks/:id` | One product check |
| GET | `/api/history` | Product checks, shaped for the History screen |
| GET | `/api/rooms` | List rooms |
| POST | `/api/rooms` | Create a room (+ optional first photo) |
| GET | `/api/rooms/:id` | One room with its photos |
| PUT | `/api/rooms/:id` | Rename / change type |
| DELETE | `/api/rooms/:id` | Delete a room (cascades photos, items' room link, generated images) |
| POST | `/api/rooms/:id/photos` | Add a photo |
| DELETE | `/api/rooms/:id/photos/:photoId` | Remove a photo |
| PATCH | `/api/rooms/:id/photos/:photoId` | Set as primary photo (`{ isPrimary: true }`) |
| GET | `/api/saved-products` | List saved products |
| POST | `/api/saved-products` | Save a product |
| DELETE | `/api/saved-products/:id` | Unsave |
| GET | `/api/items` | List owned items (optional `?roomId=`) |
| POST | `/api/items` | Log an owned item |
| PUT | `/api/items/:id` | Edit |
| DELETE | `/api/items/:id` | Delete |
| GET | `/api/generated-images` | List room visualizations |
| GET | `/api/generated-images/room/:roomId` | Visualizations for one room |
| POST | `/api/generated-images` | Request a visualization (see status note below) |
| DELETE | `/api/generated-images/:id` | Delete |
| GET | `/api/health` | Liveness check |

All list/create endpoints that accept an image use
`multipart/form-data` with field name `image` (or `productImage`/`roomImage`
for `/api/generated-images`).

### How History and Saved Products stay in sync

Both are views over the same underlying data, not independent systems:

- `POST /api/product-checks` (AI analysis) always creates one `products` row
  and one `product_checks` row pointing at it — History reads `product_checks`
  directly.
- `POST /api/saved-products` accepts an optional `productCheckId`. If given,
  it reuses that check's existing `product_id` instead of creating a new
  `products` row, and records the link on `saved_products.product_check_id`.
  If *not* given (a fresh capture saved without ever being analyzed), it
  creates a `products` row **and** a matching "unanalyzed" `product_checks`
  row (so it still shows up in History), then links both.
- `PATCH /api/product-checks/:id` updates `product_checks.detected_name`
  **and** the shared `products.name` — so a rename made from History is
  visible in Saved Products too, since they point at the same `products` row.

## AI — product analysis

`services/aiService.js` calls **Anthropic's Claude API** (vision-capable,
e.g. `claude-sonnet-5`) with the uploaded photo and forces a structured JSON
response via Claude's tool-use feature (a `record_product_analysis` tool
with a strict input schema) — so we never have to parse free-form prose out
of the model's answer.

The model is explicitly instructed to:
- distinguish what it can actually see (`description`,
  `visibleSpecifications`) from what it's estimating (`estimatedPriceMin/Max`)
- return `null` price bounds instead of inventing a number it can't justify
- only set `priceAssessment` to `fair`/`good_deal`/`overpriced` when a user
  price was supplied to compare against — otherwise `unknown`
- factor in items the user already owns (queried from `user_items`) when
  judging whether a purchase looks redundant

**Status: fully implemented**, gated on `AI_API_KEY` being set. Without a
key, `POST /api/product-checks` still works end-to-end (upload → store →
respond) but returns a clearly-marked mock analysis
(`analysis.isMock: true`) explaining that AI isn't configured, instead of
either failing or pretending to have real results.

To enable it: get an API key at https://console.anthropic.com/, set
`AI_API_KEY` (and optionally `AI_MODEL`) in `.env`.

## AI — room visualization

**Status: NOT implemented — abstraction only.** `services/imageGenerationService.js`
defines the full contract (`generateRoomVisualization({ roomImagePath,
productImagePath, roomType })`) and `POST /api/generated-images` calls it,
persists a `generated_images` row either way, and returns
`status: "pending"` with an explanatory `message` when no provider is
configured.

Why it's not wired up: Claude (the provider used for product analysis) does
not generate images. Real product-in-room visualization needs a separate
image-generation/image-editing API, and picking one has real cost/quality
tradeoffs that should be a deliberate choice, not something hard-coded here.
Once you pick a provider, implement the call inside
`generateRoomVisualization` — nothing else in the app (routes, DB schema,
mobile UI) needs to change, since they already speak the `pending` /
`completed` / `failed` status contract.

The mobile app is built to reflect this honestly: it shows a "visualization
pending — AI not configured yet" state instead of a fake generated image.

## Images

Uploaded and (eventually) generated images are stored as files under
`backend/uploads/` and served statically at `/uploads/...`. MySQL only ever
stores the relative path (e.g. `/uploads/171234-abc.jpg`); `utils/imageUrl.js`
turns that into an absolute URL (using `PUBLIC_BASE_URL`) in API responses.

This is a local-disk implementation for development. To move to cloud
storage (S3, Cloudinary, Supabase Storage, Firebase Storage, ...) later,
only `middleware/upload.js` and `utils/imageUrl.js` need to change — every
controller just calls `relativeUploadPath()` / stores whatever path/URL
comes back.

## Security notes

- Passwords: bcrypt-hashed, never logged, never returned by any endpoint.
- JWT secret: required in production (`NODE_ENV=production`); the server
  refuses to boot without one. In development it falls back to an
  obviously-insecure default and prints a warning.
- Authorization: every query that touches user-owned data filters by
  `user_id` (or checks ownership of the parent row, e.g. a room, before
  touching its photos).
- Input validation: `utils/validate.js` — required fields, string length
  caps, email format, numeric coercion. Invalid input returns `400` with a
  plain message, never a raw MySQL error.
- Errors: `middleware/errorHandler.js` distinguishes known `ApiError`s
  (safe to show the client) from unexpected exceptions (logged server-side,
  client gets a generic "something went wrong").
- CORS: configurable via `CORS_ORIGIN`; defaults to `*` for local dev.
- Secrets: `AI_API_KEY`, `IMAGE_AI_API_KEY`, `JWT_SECRET`, and DB
  credentials only ever live in `backend/.env` (gitignored) — never in the
  mobile app bundle.

## Manual testing

With the server running and MySQL reachable:

```bash
# Register
curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Password123!"}'

# Login (or use the demo account from database/seed.sql)
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123!"}'

# Use the returned token for everything else:
TOKEN="paste-token-here"

curl -s http://localhost:5000/api/users/me -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:5000/api/rooms \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=Living Room" -F "roomType=Living Room"

curl -s http://localhost:5000/api/rooms -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:5000/api/product-checks \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/path/to/a/photo.jpg"

curl -s http://localhost:5000/api/history -H "Authorization: Bearer $TOKEN"
```
