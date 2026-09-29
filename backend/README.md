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
│   │   ├── aiService.js               # product analysis + room analysis + home recommendations (Anthropic Claude, vision)
│   │   ├── imageGenerationService.js  # room visualization (NOT configured — see below)
│   │   ├── productService.js          # Find for My Home product search (MOCK — see below)
│   │   └── locationService.js         # approximate IP geolocation for Find for My Home
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
[server] AI room analysis: enabled (claude-sonnet-5)
[server] Find for My Home product search: MOCK MODE (no real product source connected yet)
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
| POST | `/api/rooms/:id/analyze` | AI-detect objects in the room's photos → save new ones to `user_items` (see "AI — room analysis") |
| GET | `/api/rooms/:id/capture` | The room's 180°/360° capture with all views, or `{ capture: null }` (see "Room capture") |
| POST | `/api/rooms/:id/capture` | Upload a room sweep (multipart `video`, `mode`, `motion`) → extract views |
| PATCH | `/api/rooms/:id/capture/:captureId` | "USE THIS VIEW": `{ selectedFrameId }` (null = primary photo again) |
| DELETE | `/api/rooms/:id/capture/:captureId` | Remove the capture (its view files too; room photos untouched) |
| GET | `/api/saved-products` | List saved products |
| POST | `/api/saved-products` | Save a product |
| DELETE | `/api/saved-products/:id` | Unsave |
| GET | `/api/items` | List items — `?roomId=` filters to one room. This is also "My Items"/"a room's items"; there is no separate endpoint for those, to avoid duplicating the same query. |
| POST | `/api/items` | Create an item directly (legacy manual-entry path — the mobile app no longer exposes a UI for this; items are populated by room analysis instead) |
| PUT | `/api/items/:id` | Edit |
| DELETE | `/api/items/:id` | Delete |
| GET | `/api/generated-images` | List room visualizations |
| GET | `/api/generated-images/room/:roomId` | Visualizations for one room |
| POST | `/api/generated-images` | Request a visualization (see status note below) |
| PATCH | `/api/generated-images/:id` | Rename — updates the linked product check's (and shared product's) name when there is one, not just this row |
| DELETE | `/api/generated-images/:id` | Delete |
| POST | `/api/generated-images/session` | Generate one room + N products (Cloudflare) |
| PUT | `/api/generated-images/:id/layout` | Save the product layout of a visualization |
| POST | `/api/product-cutouts` | Remove a product photo's background → transparent PNG layer |
| POST | `/api/product-models` | Get / start the 3D model of a product cutout (`{ cutoutId, retry? }`) |
| GET | `/api/product-models/:id` | 3D model status (`processing` / `ready` / `failed`, real stage) |
| POST | `/api/product-selection/detect` | Does the photo clearly show ONE product? → `{ route: 'auto'|'select', reason, products }` |
| POST | `/api/product-selection/crop` | Freehand outline (`polygon`, normalized) → PNG of just that product |
| POST | `/api/find-for-my-home` | AI product recommendations for the user's home (see "Find for My Home") |
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

### Room context (`roomId`)

`POST /api/product-checks` accepts an optional `roomId` (the app's "Which room
is it for?" chips). `services/roomContextService.js` reads that room's
existing Items Detected data (`user_items` + `room_item_observations`; photo,
180° and 360° rooms alike, nothing is re-detected) and adds it to the prompt:

- confidence ≥ 0.8 → "was detected"; lower or unknown → "a …-like item may be present"; manual items → "added by the user"
- an item missing from the list is "not detected in the selected room", never "not owned" (the rest of the inventory is listed as "elsewhere in the home")
- the model reasons about duplicate / replacement / complement / fills-a-gap, not "already have a chair = skip"

The response then has `roomContext: { room, items, fit: { relation, summary, relatedItems } | null }`.
Without `roomId` (or for a room that isn't the user's) the prompt is exactly as before.

### Where to find it: online, nearby, social

Three SerpApi searches run in parallel after the analysis, each failing on its own:

| Group | Service | SerpApi engine | Response field |
| --- | --- | --- | --- |
| Online stores | `webSearchService.js` (unchanged) | `google` | `comparison.alternatives` / `exactMatch` (`sourceType: online_store`) |
| Nearby stores | `localDiscoveryService.js` | `google_maps` (`type=search`, place word in `q`) | `comparison.localStores` (`local_store`, `google_maps`) |
| Social media | `localDiscoveryService.js` | `google` + `site:instagram.com OR site:facebook.com OR site:tiktok.com` | `comparison.socialProfiles` (`social_profile`, `instagram`/`facebook`/`tiktok`) |

Statuses: `comparison.search.status` / `localStatus` / `socialStatus`. Location is the
coarse city the client sends (`city`, `country`) or the IP lookup; none → Kosovo-wide.
Map results outside Kosovo's bounding box are dropped. Nothing is scraped: social
profiles come from the URL/label Google returns (else the public post link is shown).
Local and social results never carry a price or an exact-match claim.

**SerpApi budget (free plan: 250 searches/month):** one analysis uses up to 6
online + 2 maps + 1 social searches (identical searches within an hour are served
from SerpApi's cache for free). SerpApi sometimes answers in 20–30 s; the
nearby/social searches wait up to 30 s, the online search keeps its 15 s timeout.

## AI — room visualization

`services/imageGenerationService.js` uses Cloudflare Workers AI with FLUX.2
[klein] 4B (`IMAGE_AI_MODEL`, default `@cf/black-forest-labs/flux-2-klein-4b`).
The 4B weights are Apache-2.0. Don't switch to `flux-2-klein-9b`: its weights
are under BFL's non-commercial license. 4B is also much cheaper: about 125
neurons per 1024x1024 render with 4 references, against about 1,550 for 9B, out
of 10,000 free neurons per day. It needs `IMAGE_AI_PROVIDER=cloudflare`,
`IMAGE_AI_API_KEY` and `IMAGE_AI_ACCOUNT_ID`. Without them, the request is
stored with status `pending`.

The model's documented limits are: up to 4 reference images
(`input_image_0`..`input_image_3`), each smaller than 512x512; output sides of
256-1920px; 4 fixed steps; and no mask or strength input. Layout control
therefore comes only from the reference images.

**AI Render** (`POST /api/generated-images/session`, Visualization screen).
The app sends each product's Arrange layer: position, width, rotation, aspect,
zIndex, and which image the layer shows (3D view, cutout or photo).
`services/arrangeCompositionService.js` rebuilds the exact Arrange picture with
sharp, using the same math as `RoomComposer.tsx`. The request then contains:
- `input_image_0`: the Arrange composition. This is the spatial reference for
  position, size, rotation, overlap and the number of products.
- `input_image_1..3`: the ORIGINAL product photos (background-removed
  cutouts) of up to 3 products, as the authority for appearance. Layers showing
  a 3D view get these slots first, then the largest products.
- `width`/`height`: the composition's size, so the render lines up with Arrange.

The Arrange composition decides where each product is: position, size,
rotation and facing. The product photo decides what it looks like. The prompt
calls a 3D-view layer a "rough 3D preview" whose shape, proportions, colors and
materials may be wrong. It asks the model to redraw that product from its photo
and correct the reconstruction instead of copying it. Sides the photo doesn't
show are only inferred, and the prompt asks for them to stay simple and
consistent. The prompt order is arrangement, then product, then room, then
realism, then clutter. The model may remove only small loose clutter (towels,
clothes, packaging), and anything uncertain is kept.

Requests without layers (older app builds, and `POST /api/generated-images`
for a single product) use the previous request: the room photo plus product
photos, with a text placement hint.

`IMAGE_AI_DEBUG=1` saves each AI Render's composition, reference images and
prompt to `uploads/render-debug/`.

## Room capture (180° / 360° room views)

This feature is optional. A room can have one capture: a slow room sweep
recorded in the app, split into real views the user can swipe through. The
room's photos are never changed. Rooms without a capture work exactly as they
did before, and every room response carries `capture: null` for them.

Database: migration `../database/migrations/004_room_captures.sql` adds two
new tables, `room_captures` and `room_capture_frames`. Migration `005` adds
the nullable `lens` column. Neither touches existing tables.

**Lens.** On iPhones that have a physical ultra-wide camera, the app records
with it (0.5×). It finds the lens with expo-camera's `getAvailableLensesAsync`
and `selectedLens`, matching the device name "Ultra Wide". Otherwise, and on
Android, it records with the normal 1× lens. expo-camera 57 has no lens
selection on Android, and its `zoom` prop can only zoom in, so it isn't used.
The upload sends `lens` (`wide` | `ultra-wide`), and `LENS_PROFILES` in the
service adjusts the rules:

| Lens | Slot spacing | Speed penalty starts | Rejected as too fast above |
|---|---|---|---|
| `wide` (1×) | 5° | 40°/s | 45°/s |
| `ultra-wide` (0.5×) | 8° | 60°/s | 70°/s |

The ultra-wide sees about twice as much of the room, so the same turning
speed blurs about half as much. The app's pace guidance for each lens is in
`src/services/roomCaptures.ts` (`CAPTURE_LENSES`). All these values are
estimates, not real-phone measurements. Videos are recorded at 720p, 16:9.

`services/roomCaptureService.js` does the processing. No AI or interpolation
is involved, and it never produces viewpoints that weren't filmed:
1. **Decode.** `ffmpeg-static` (standard ffmpeg, run as a separate process)
   extracts 10 candidate frames per second, longest side ≤ 1280px. It reads
   H.264 MP4 from Android and HEVC MOV from iOS, and follows the video's
   rotation metadata.
2. **Angles.** The app sends the phone's turn around the vertical axis,
   integrated from the gyroscope and projected on gravity (see
   `src/services/roomCaptureMotion.ts`). expo-sensors 57 names the axes of
   DeviceMotion `rotationRate` differently on each platform. Android maps
   alpha/beta/gamma to x/y/z; iOS maps them to z/y/x. `deviceRotationRate()`
   converts both back to device axes. Mixing them up measures the wrong axis:
   a real 180° turn read as about 2°. The camera has no "recording started"
   event, so the video is aligned to the track by its end:
   `videoStart = stopAt − duration`. Expect about ±0.2 s of error, a few
   degrees at a slow turn. If the track is missing, sparse or has gaps,
   angles are estimated from time assuming a steady turn. The capture is then
   saved with `angle_source = 'time'`, a warning, and no 360° wrap-around.
3. **Selection.** The range is split into 5° slots. Each slot keeps the frame
   with the best `sharpness × exposure × turning-speed penalty`, with a mild
   preference for the slot centre. Sharpness is the Laplacian at 320px from
   `sharp`, and is only compared within one capture. Duplicate frames collapse
   into their slot, and empty slots stay empty.
4. **Validation.** The capture is rejected with HTTP 422 and a message
   (`details.code`) in these cases:
   - `INSUFFICIENT_COVERAGE`: a 180° capture covered less than 150°.
   - `INCOMPLETE_360`: a 360° capture left a gap back to the start wider than
     the lens's `maxGapDeg`. That means less than 335° at 1× or 315° at 0.5×.
   - `COVERAGE_GAPS`: more than 25% of the covered slots are empty, or any
     stretch between neighbouring views is wider than `maxGapDeg` + one slot.
   - `TOO_FAST`: most views were taken at more than 45°/s.
   - `BLURRY`, `INSUFFICIENT_FRAMES`, `TOO_SHORT`/`TOO_LONG` (3 s – 2 min),
     `UNSUPPORTED_VIDEO`.

   180° and 360° are targets, not exact numbers. A 180° capture keeps its views
   up to 200°, so a 185° or 190° capture loses nothing; beyond that it is
   trimmed, with a warning. A 360° capture that goes past a full turn folds
   back into 0–360°. The app shows the same acceptance point: its progress bar
   turns green there (`minCoverageDeg()` in `src/services/roomCaptures.ts`).
5. **Storage.** Each view is saved as a full frame (≤ 1280px, used by
   Arrange/AI Render) and a preview (≤ 640px, used for swiping). The uploaded
   video is deleted after processing. A new capture replaces the previous one
   only after it has been stored successfully. A 360° capture is about 72
   views, about 7–15 MB (7.4 MB in testing).

**USE THIS VIEW** saves `selected_frame_id`. New visualizations of the room
then start from that view (`roomWorkingImage()` in the app).
`POST /api/generated-images/session` accepts `roomViewId`. The backend checks
the view belongs to this user's room and uses it as AI Render's room image
instead of the primary photo.

`ffmpeg-static` downloads its binary in an npm install script. If your npm
blocks install scripts, run `npm approve-scripts ffmpeg-static` or
`node node_modules/ffmpeg-static/install.js`. The binary is GPL-3.0. That's
fine for running it on our own server, but distributing it would bring
GPL obligations.

## Items Detected (room item detection)

`POST /api/rooms/:id/analyze` finds a room's existing furniture and records
where each item appears. This is selection only: detected furniture is not a
movable object.

- **Provider:** the project's existing Groq vision model (`AI_PROVIDER=groq`,
  `AI_API_KEY`, `AI_MODEL`), in `services/roomItemDetectionService.js`. No new
  service and nothing installed. It only looks for furniture-sized objects:
  sofa, armchair, chair, dining chair, bed, coffee table, dining table, table,
  desk, nightstand, dresser, cabinet, wardrobe, bookshelf, tv stand, tv, lamp,
  floor lamp, mirror, rug, fireplace and plant. Small clutter, specks and
  low-confidence results are dropped.
- **Box coordinates:** the model returns 0–1000 coordinates measured against
  the image's LONGER side on both axes. `parseDetections()` converts them
  (checked on portrait, landscape and square images).
- **Photo room:** only the primary photo is analysed, giving one sighting per
  item. Two different photos can't be told apart from two objects without a
  shared coordinate system.
- **180°/360° room:** a few evenly spaced views are analysed, spaced about
  0.7 × the lens field of view and at most 8 (a 180° 0.5× room uses 5 of 22
  views). Each box becomes the room-direction range it covers. Sightings of
  the same kind of object, in the same direction and height range, are merged
  into one item as connected groups, so the result doesn't depend on order.
  Merging handles the 0°/360° seam. Directions are 2D; there are no 3D
  coordinates.
- **Storage:** each item is a `user_items` row (`source = 'ai'`, the
  inventory). Where it was seen goes in `room_item_observations` (migration
  007): a box on a room photo or a captured view, plus the direction range for
  spatial rooms. Re-running detection replaces the room's previous AI items;
  manual items are kept. `GET /api/items?roomId=` returns items with their
  `observations`.
- **Free tier:** Groq allows about 7,000 input tokens per minute for this model
  and reserves about 2,250 per image, so roughly 3 views per minute. Requests
  follow Groq's "try again in …" hint. A 180° room takes about 1 minute, a
  360° room about 1.5–2 minutes.
- **Failures:** a failed detection returns 502 with a friendly message. The
  room and its existing items are untouched.
- **Without Groq:** other AI providers use the previous name-only analysis
  (`aiService.analyzeRoomImages`).

## Product background removal

`services/backgroundRemovalService.js` → `removeBackground({ imagePath })`,
used by `POST /api/product-cutouts` (multipart `image`, or `productCheckId`).
Provider: our Cloudflare Worker in `cutout-worker/`, which uses Cloudflare
Images `segment: "foreground"` (BiRefNet, MIT). It is free for 5,000 photos
per month under Cloudflare's standard terms, and it accepts photos up to 15MB.
It needs `CUTOUT_WORKER_URL` and `CUTOUT_WORKER_SECRET`; setup is in
`cutout-worker/README.md`.

Background removal is completely separate from image generation.
`node scripts/preview-cutouts.js <folder>` previews cutouts and their quality
warnings without starting any 3D generation.

- Output: transparent PNG, trimmed to the product, longest side ≤ 1200px,
  stored as `uploads/cutout-<sha256 of photo>.png`. The same photo is never
  sent twice (the file is the cache). No database changes.
- The original photo is not modified; generation still uses the original.

## Product selection (before background removal / 3D)

`services/productSelectionService.js`. Before a product enters the pipeline,
the app asks `POST /api/product-selection/detect` (Groq vision, same
provider/model as product analysis — a separate prompt, the Analyze flow is
unchanged). Automatic only if exactly one product is listed, it's the clear
subject, fully visible, and confidence ≥ 0.6; otherwise (several, unclear,
none, or detection unavailable) the app shows the freehand selector. The
outline is cut from the original photo with sharp (outside → white, cropped
around the selection) and that image goes into the same existing pipeline.
Uploads for these endpoints are temporary; nothing is stored.

## Input quality for 3D (before TRELLIS.2)

The image the 3D model sees is prepared in two places, with no AI calls:

- `services/productImageQuality.js` (inside background removal): removes small
  detached background-removal specks and measures the product — size, how
  much of it runs into the photo edge, brightness, sharpness (Laplacian),
  fill. `assessQuality()` turns that into advisory warnings (`cut_off`,
  `small`, `blurry`, `dark`, `bright`, `background`, `sparse`), stored as
  `uploads/cutout-<hash>.json` and returned by `/api/product-cutouts` as
  `quality`. The app pauses 3D for flagged photos and lets the user retake,
  continue anyway, or keep the product 2D. Thresholds are conservative.
- `services/modelInputService.js` (right before generation): tight crop,
  centered on a transparent 1024×1024 square with 5% padding, uniform scaling
  only (proportions never change).

## 3D furniture (TRELLIS.2)

Product pipeline: photo → background removal (Cloudflare) → **3D model
(TRELLIS.2, `services/trellisService.js`)** → the app renders the GLB into
turntable views that become the product's layer in the room. 3D is an
enhancement: if it fails or isn't configured, the product stays 2D.

- Provider: Microsoft's TRELLIS.2 (MIT) on the public Hugging Face Space
  `microsoft/TRELLIS.2` (ZeroGPU), via Gradio's HTTP queue protocol:
  `preprocess_image` → `image_to_3d` → `extract_glb`, all in one session.
  Settings in `GENERATION_SETTINGS` (resolution 512, 100k faces, 1024px
  textures — lighter for phones and the GPU quota).
- Config: `HF_TOKEN` in `backend/.env` (free "Read" token from
  https://huggingface.co/settings/tokens; never in the app). Without it,
  `POST /api/product-models` returns 503 `not_configured` and nothing is stored.
- **Development only:** free accounts get a small daily ZeroGPU quota and each
  GPU step reserves 120s of it, so expect only a few models per day (the
  Space answers "You have exceeded your ZeroGPU quota" when it's used up —
  shown to the user as today's limit). The Space's API is a demo and can
  change or be busy without notice.
- Quota protection (`services/productModelService.js`, table
  `product_models`, migration 003): one row per user + cutout hash with a
  UNIQUE key, so a photo starts at most one generation; failed models only
  re-run with `retry: true`. Generations run one at a time on the server and
  the GLB is saved as `uploads/model-<hash>-<id>.glb`. A generation
  interrupted by a server restart is marked failed (retry restarts it).

## AI — room analysis

`services/aiService.js#analyzeRoomImages` calls the same Anthropic Claude
API used for product analysis (vision + tool-use, this time a
`record_room_items` tool) with up to 5 of a room's photos in one request,
and asks it to list the distinct physical objects actually visible —
never inventing anything it can't identify, and never structural elements
like walls/floors/doors.

`POST /api/rooms/:id/analyze` is the endpoint the mobile app calls right
after a room (and its first photo) is saved, and again whenever a new photo
is added to an existing room:
1. Loads the room's current photos and its already-recorded `user_items`.
2. Passes the already-known items to the AI as context, so a re-analysis
   doesn't re-describe furniture it already knows about.
3. As a hard guard against duplicates, also skips inserting any returned
   item whose name+category already exactly matches an existing one for
   that room.
4. Inserts genuinely new items with `source = 'ai'` and returns only the
   newly-created ones (not the room's full item list).

Analysis is always a separate, best-effort call from room/photo saving —
a failure here is caught and logged by the mobile app but never undoes or
blocks the already-successful room/photo save.

**Status: fully implemented**, gated on the same `AI_API_KEY` as product
analysis. Without a key, it returns a clearly-marked mock detection
(`isMock: true`) built from a small per-room-type furniture list (e.g. a
mock "Living Room" analysis suggests a sofa, coffee table, TV, TV stand)
instead of calling out to Claude — so the whole room → analyze → My Items
flow is testable without any AI credentials.

## Find for My Home

`POST /api/find-for-my-home` (body: optional `{ category, budget, city }`)
ties three things together:

1. **Home understanding** — the user's rooms and their AI-detected
   `user_items` (plus, for light extra context, their 10 most recent
   product checks) are read from the database.
2. **Product search** — `services/productService.js#searchProducts`
   returns candidate products. **No real store/product source is connected
   yet** — it returns a small, explicitly `isMock: true` illustrative
   catalog (clearly-labeled placeholder store names, no fabricated images
   or product URLs) instead of pretending to have real Kosovo store data.
   The function signature (`{ category, city }` in, a flat product list
   with `store`/`price`/`currency`/`dimensions`/etc. out) is what a real
   integration (GjirafaMall, JYSK Kosovo, or another retailer's feed/API)
   would implement — nothing else in the app would need to change.
3. **AI ranking** — `services/aiService.js#analyzeHomeNeeds` is given the
   home context and the candidate products (referenced only by id — the
   model is explicitly told never to invent a product not in that list) and
   asked which ones are genuinely useful additions and why. It is correct
   and expected for it to recommend fewer products than were offered,
   including zero — the prompt explicitly discourages recommending
   something just because it exists.

**Status: architecture fully implemented, product data is MOCK.** Every
response carries `isMock` (true if either the AI reasoning or the product
data is mock) so the mobile app can label results honestly rather than
presenting mock picks as real ones.

### Location

Recommendations try to prioritize nearby stores using `services/locationService.js`:
- A city the user types in the app always wins.
- Otherwise, the backend takes the request's IP and, **only if it is not a
  private/loopback address** (`192.168.x.x`, `10.x.x.x`, `127.0.0.1`, `::1`,
  etc. are rejected immediately, with no network call), makes one best-effort,
  short-timeout lookup against a free keyless IP-geolocation API for an
  approximate country/region/city.
- Any failure (private IP, network error, timeout, malformed response)
  resolves to `location.source: "unknown"` — never a guessed or fabricated
  location.
- The IP address itself is never logged, stored, or included in any
  response — only the derived city/region/country, and only for the
  duration of that one request.
- In local development the request IP is essentially always private, so
  you should expect `"unknown"` unless you pass `city` explicitly — that's
  correct behavior, not a bug.

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
