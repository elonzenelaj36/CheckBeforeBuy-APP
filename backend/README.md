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
| GET | `/api/rooms/:id/walls?frameId=` | Walls of the room's primary photo, or of one captured view (see "Wall-mounted products") |
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

### Same product by image (Google Lens)

`services/visualSearchService.js` searches with the photo itself, in parallel with
the AI analysis (no extra waiting):

1. The photo (resized JPEG ≤ 500 KB) is uploaded to `https://serpapi.com/image`
   → `image_id`. SerpApi deletes it after **10 minutes**; the upload is free.
2. `engine=google_lens&image_id=…&type=all&hl=en&country=$LENS_COUNTRY` (1 search).
   `country=xk` returns nothing; the default `de` gives EUR prices.

Lens's `related_content` names the model ("IKEA POÄNG armchair"); it is trusted
only when its distinctive words appear in ≥ 2 listing titles. Then listings whose
title carries those words are `matchType: 'strong'` (same model, `imageMatch: true`),
the Kosovo text search looks for that name, and it becomes the check's product name
(unless the user typed one). Prices come only from Lens's structured `price` field.
`comparison.exactPriceStats` / `highlight.sameModel` / "Same model cheaper elsewhere"
compare your price with the same model first; the reasoning always warns that
listings can be another color/size or from another country.

### Verdict

`services/verdictService.js` writes `verdict: { title, text, decision, source }`:
one text-only Groq call over facts that were already computed (price comparison,
room fit, recognised name, nearby stores). The text is rejected — and a plain
template used instead — if it contains a number not in the facts or contradicts
`decision`. The app shows it as "Our verdict" with the old cards under "See details".

### Nearer results, honest prices (2026-09-29)

- **Kosovo shops:** `webSearch.searchKosovoShops` searches GjirafaMall, Foleja, MerrJep,
  Gjirafa50, Neptun and JYSK Kosovo directly (`site:` filter) for the recognised model,
  else the Albanian product noun. Results count as Kosovo listings.
- **Ranking:** Prizren → Kosovo → region → EU (`.de`, `ikea.com/de/…`) → the rest.
  US/international listings are hidden when 3+ nearer results exist.
- **Social image matches:** a second Lens search on the same upload with `q=instagram`
  returns Instagram posts of the same product; posts/profiles in the user's city or
  Kosovo are listed first. (Longer `q` values returned nothing when tested.)
- **Currency:** non-EUR prices get `convertedPrice` via `services/fxService.js`
  (European Central Bank daily reference rates — free, cite the ECB; "for information
  only"). Converted prices are reference only (shipping/import not included).
- **Verdict with confidence** (`comparison.confidence`, `comparison.evidence`): same-model
  EUR prices → high/medium; 2+ similar EUR prices → high/medium; one EUR listing,
  EUR price ranges, or converted foreign prices → a verdict marked `low` ("rough guide");
  UNKNOWN only when no usable price exists at all.
- **City from the phone:** the app (`src/services/userLocation.ts`, `expo-location`) sends
  only `city`/`country` from a lowest-accuracy fix + on-device reverse geocoding; no
  coordinates leave the phone. Cached 6 h. Denied/unavailable → IP lookup / Kosovo-wide.
- Lens results are cached in memory for 24 h per photo (same photo again = no credits).

**SerpApi budget (free plan: 250 searches/month):** one analysis uses up to
2 Lens + 3 online + 2 Kosovo shops + 2 maps + 1 social = **10 searches** (the image
upload is free; identical searches within an hour are served from SerpApi's cache for
free) — about 25 analyses a month. SerpApi sometimes answers in 20–30 s; Lens/shops/
nearby/social wait up to 30 s, the online search keeps its 15 s timeout.

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

### Room preservation (`roomPreservationService.js`)

The AI's picture is never saved as it is. FLUX redraws the whole room, so the
result is rebuilt on the ORIGINAL photo (at its own resolution, up to 2048 px).
For floor products, the product is taken **as FLUX drew it** (`aiProduct`), so
it's realistic, from the product photo:
- **Finding it:** near the arranged spot, the pixels FLUX changed from the
  room. The room is first tone-matched to FLUX's output locally, from the area
  around the product, because FLUX also relights the floor. The shape that
  overlaps the arranged product is kept, with small holes filled.
- **Placing it:** it's moved so it covers the arranged product best
  (overlap/union), because FLUX often draws it a little off and the user's
  placement is authoritative.
- **Its outline:** FLUX's picture around the product goes through the same
  background removal as product photos (`fetchRawCutout`, the BiRefNet
  Worker, ~4 s, one call per floor product per render, counts towards the
  Worker's free 5,000/month). That matte is the product's exact outline,
  soft edges included, kept only within 6% of what FLUX visibly changed near
  the arranged spot (so a laptop FLUX invented on the dresser stays out).
  Colour differences alone can't separate a grey chair from a floor FLUX
  also repainted: that gave ghost legs, torn edges and pasted floor patches.
  If the Worker fails or the matte is the wrong size, the changed pixels
  are used, closed (dents up to 7% of its size), small holes filled, grown
  1.5% and feathered. Its shadow is never pasted: it is the soft darken-only
  zone below.
- **Fallback:** if FLUX didn't draw it there (overlap under 0.35, or a
  changed area under 0.4× or over 3× the product, shadow included), the arranged 3D view is used and the reason is logged
  (`[roomPreservation] AI product not found (…)`).
- **Shadow:** an ellipse under it, plus the 3D viewer's own faint ground
  shadow. There FLUX may only darken the real floor. That output is first aligned to the photo
(shift search) and colour-matched on a ring around the zone. When the AI
moved or lost a product (it matches the arrangement below 0.35), that
product's arranged pixels are used instead. Every pixel outside the product
zones is checked to be the photo's own (`backgroundPixelsChanged` must be 0;
logged as "room kept"). Output is PNG.

### Wall-mounted products (paintings, mirrors, TVs, wall shelves)

A product is wall-mounted when its 3D model is an upright, thin panel:
depth under 20% of its width, height over 20% (`wallShaped` in
`productModelService.js`, read from the GLB's bounds; paintings measure
0.03–0.13, furniture 0.74+, and rugs don't qualify because they are thin
vertically). Its name/category also counts (`isWallMountedProduct` in
`src/services/roomWalls.ts`). The backend checks the model shape itself, so
an unnamed photo ("Unknown product") still counts.

**3D camera height in 180°/360° rooms:** `productElevationDeg` needs the
captured views' real shape. The Arrange screen reports it
(`setSessionFrameAspect`) once the view loads. Before, portrait 9:16 was
assumed, so in landscape captures (1280×720) a chair low in the picture was
drawn from 55° above instead of 30°, which looked squashed.

**Photo first** (app): wall products are shown as their real photo (cutout),
and no 3D model is made for them unless the user taps "Show as 3D anyway"
(with a warning that flat products' 3D is approximate and uses the 3D quota).
They're recognised before any 3D exists by Groq on the cutout itself
(`productKindService.js`, cached as `cutout-<hash>.kind.json`, returned as
`kind: { name, wallMounted }` by `POST /api/product-cutouts`). That also covers
products the user outlined by hand. Also by the photo check's product name
(`/product-selection/detect` → `detected`, stored as the product's category,
e.g. "framed picture"). A 3D model's shape is the backup.

**Wall preview** (`GET /api/rooms/:id/walls/preview?frameId&wallId&cutoutId&x&y&width&aspect`,
`roomWallsController.js`): once a photo-mode product is on a wall, Arrange
shows a PNG of its cutout warped onto that wall. It uses the same geometry and
the same `warpLayerToQuad` as AI Render, so the preview matches the generated
image. The PNG covers the layer's box × 1.6 (`PREVIEW_BOX_SCALE` /
`WALL_PREVIEW_BOX_SCALE`). It's about 0.1 s and is re-requested only on drop.

**Wall attachment** (app, `attachToWall` in `visualizationSession.ts`): a wall
product is either ON a wall of the picture in view or free. It's worked out
when the product is dropped, the view changes, or its cutout/3D views arrive,
never during a drag. It attaches when its centre is inside a detected wall
with confidence ≥ 0.5 (`MIN_PREVIEW_CONFIDENCE` in `roomWalls.ts`, the same
value as the backend's `MIN_WALL_CONFIDENCE`). There's no 3D distance: a room
is one picture, so "on the wall" means inside its region.
- Attached: its angle is the wall's. The 3D preview turns to lie flat on it,
  its tilt is reset, the turn controls are hidden, the twist gesture is ignored,
  and a chip says "ON THE WALL".
- Free: it faces the camera again and can be turned like any 3D object.
- Generate refuses a wall product that isn't attached in the current view
  ("Move … onto a wall before generating").

The app sends
`layer.kind = 'wall'` plus `layer.wallId` (the wall it's attached to).

**Wall detection** (`wallDetectionService.js`, `GET /api/rooms/:id/walls`):
- WHERE: the Items Detected Groq vision call (`askGroqAboutImage`) with a
  walls prompt. Each visible wall gives 4 corners, `facing`
  (front/left/right), `mountable` and `confidence`.
- WHICH WAY: deterministic geometry from the room's own straight lines
  (`lineSegmentService.js`, an LSD-style detector on Sobel gradients;
  `wallGeometry.js` turns each line into a 3D direction for the picture's
  camera).
  - **Room directions (`roomAxes`):** rooms are built at right angles, so
    nearly every horizontal line runs along one of two perpendicular
    directions. All the picture's lines vote: walls, skirting, window tops,
    beds, dressers. A sloped attic ceiling fits neither direction and barely
    counts.
  - **Vanishing point (first choice, `vanishingPoint`):** where the wall's own
    horizontal lines meet in the picture: ceiling and floor lines, skirting,
    door tops. It needs at least two lines at different heights, and it must
    put the wall on the side Groq saw it (left/right walls must really turn
    that way). When it's found, a painting's top and bottom edges are aimed
    at it (`wallQuadToVanishingPoint`), and the wall's angle comes from it.
    This is found in the picture itself, so it matches the room's lines even
    when the camera (lens width, tilt, a cropped photo) is only roughly known.
  - **Choosing per wall:** each wall takes the direction that faces the way
    Groq says (front/left/right), or, if that's ambiguous, the one closest to
    the lines on and around its own region (`geometry: 'room-lines'`).
  - **Fallbacks:** with too few lines (under 30% agreement), the strongest group
    of lines on the region (`'lines'`), else its rough edges (`'edges'`).
  - **Why:** Groq's corners are only a rough box, often the photo's own edges,
    and furniture lines inside a wall's area run other ways.
  - **Cache:** the walls cache keeps Groq's raw regions separately, so geometry
    changes (`CACHE_VERSION`) recompute angles without a new Groq call and keep
    the wall ids.
  Captures use their measured FOV and recorded tilt; photos assume a
  69.4° phone lens and measure tilt from vertical edges.
- Disagreement between the geometry and the model's front/left/right lowers
  the confidence. Walls below 0.4 are dropped. Cached per picture as
  `<image>.walls.json` (1 Groq call per picture); a Groq failure isn't cached.
  Concurrent requests for one picture share a single analysis. An answer with
  no walls is asked once more, isn't cached on disk and isn't asked again for
  2 minutes. The app starts detection as soon as products are added (while
  background removal runs), so a painting dropped on a wall is usually placed
  without a "finding the wall" wait; a picture's walls are kept in memory.
- **180°/360° views are checked against the whole recording**
  (`alignToCapture`). Each view's direction is known from the gyroscope, so
  every wall of every analysed view votes for the room's four directions
  (axis + k·90°). A wall ≥ 20° off all of them — a plain wall, or a sloped
  attic ceiling read as a horizontal line — is turned to the nearest room
  direction that keeps it on the side Groq saw it (`geometry:
  'room-capture'`, its vanishing point dropped). Runs per request (needs ≥ 6
  walls in ≥ 4 views), so views analysed later improve it.
- Recordings without a recorded camera tilt (made before the app sent it):
  the app uses the tilt the wall analysis measured from vertical lines
  (`camera.pitchSource === 'measured'`), else the recording's median, for the
  3D product's up/down angle — before, such rooms were treated as level and
  a chair was drawn from too low.

```json
{ "status": "ok", "camera": { "fovDeg": 69.4, "aspect": 1, "pitchDeg": 10.5, "pitchSource": "measured" },
  "walls": [{ "id": "wall_1", "polygon": [[0.18,0.25],[0.93,0.24],[0.85,0.83],[0.2,0.71]],
              "facing": "front", "mountable": true, "confidence": 0.95, "normalDeg": -169.4, "geometry": "edges" }] }
```
`normalDeg`: the horizontal direction the wall faces, in degrees from the
camera's forward direction (+ = right; ±180 = straight at the camera).

**AI Render** (`resolveWallLayers` in `imageGenerationService.js`): at the
product's FINAL position, the wall containing it is found. If it is confident
(≥ 0.5), the product lies flat on it: it faces `wall.normalDeg`, and any turn
(`userYawDeg`) or tilt from older apps is ignored. A painting has exactly one
correct angle. Its exact
perspective quad is projected with a pinhole camera: its size is the layer's
on-screen height, its proportions the real product photo. The product's real
cutout is warped into that quad (bilinear sampling, soft 1-px edge) for both
the FLUX reference and the final picture, so the frame, the bottom edge and the
design are the photo's own pixels, not redrawn. A deterministic soft shadow is
added, and FLUX's lighting tone is applied only when its render matches. With
no wall, low confidence or an edge-on view, the product still comes from its
real photo, hung facing the camera plus the user's turn (logged as
`wall products: [{used:false, reason, facing:'camera'}]`). It never comes from
the 3D preview's frame. Only a product without a cutout keeps the previous
behaviour.

**3D preview** (app): the turntable renderer compares every frame with the
cutout photo (outline + brightness-pattern correlation) to find the frame that
shows the photographed front. TRELLIS sometimes puts it at 180°, and the back
of a painting shows a mirrored texture. A wall-mounted product's preview then
starts ONCE at that front, turned to the wall at its position (`autoYawDeg`).
After that it never turns by itself: dragging doesn't re-derive the angle, and
any user turn wins.

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

### Picture-checked angles (captureAlignmentService.js)

The rotation sensor's total turn is reliable, but locally it drifts from the video,
and the real field of view differs from the lens's nominal one (a 0.5× capture measured
≈60° in portrait, not 75°). Every new capture is therefore checked against its own
pictures during upload (pure image maths, ~5 s):

- the horizontal shift between each pair of neighbouring views (normalised
  cross-correlation, sub-pixel) gives the **measured field of view** (`room_captures.fov_deg`)
  and **corrected angles** (`angle_deg`; the sensor's value stays in `gyro_angle_deg`,
  the total turn is kept);
- pairs that don't line up get `align_score = 0` and the viewer **snaps** between them
  instead of cross-fading (`roomViewMath.blendAt`, `SNAP_BAND`);
- the app, item detection and product placement use the measured field of view
  (`captureFovDeg()`), else the lens default (0.5× now 60°).

Migration `009_capture_alignment.sql`. Existing captures: `node scripts/align-captures.js [captureId…]`
(re-runnable; also recomputes the directions of detected items). On room 16 it cut the
mismatch between two views of the same object from 6–12° to 1–2°.

## Items Detected (room item detection)

`POST /api/rooms/:id/analyze` finds a room's existing furniture and records
where each item appears, with each item's main `color` and `material`
(migration `008_user_item_color_material.sql`; rooms detected earlier need
DETECT AGAIN to get them). This is selection only: detected furniture is not a
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
