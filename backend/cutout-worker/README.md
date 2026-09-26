# Cutout Worker (Cloudflare background removal)

A small Cloudflare Worker that removes the background of a product photo with
the Cloudflare Images binding (`segment: "foreground"`, the BiRefNet model run
by Cloudflare). The backend calls it from `src/services/backgroundRemovalService.js`
when `BACKGROUND_REMOVAL_PROVIDER=cloudflare`.

- Free plan: 5,000 unique transformations per month. The same photo counts
  once. Over the limit, requests fail with 429 and nothing is charged.
- No AI runs on this machine. The Worker lives on `*.workers.dev`, so no
  domain is needed.
- The request must carry `Authorization: Bearer <CUTOUT_SECRET>`, so nobody
  else can use up the quota.

## Deploy (one time)

```bash
cd backend/cutout-worker
npm install
npx wrangler login                  # opens the browser; use the same Cloudflare account as Workers AI
npx wrangler deploy                 # prints https://cbb-cutout.<subdomain>.workers.dev
openssl rand -hex 32                # make a secret
npx wrangler secret put CUTOUT_SECRET   # paste it
```

Then add to `backend/.env`:

```
CUTOUT_WORKER_URL=https://cbb-cutout.<subdomain>.workers.dev
CUTOUT_WORKER_SECRET=<the same secret>
```

Restart the backend afterwards (it reads `.env` only at startup).

## Preview cutouts

This test uses no TRELLIS quota. Put some furniture photos in a folder and run:

```bash
cd backend
node scripts/preview-cutouts.js <photo-folder>
```

The script writes `original | cutout` sheets to `<photo-folder>/cutout-preview/`.

Logs: `npx wrangler tail`.
