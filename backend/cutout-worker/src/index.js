/**
 * Check Before Buy — product background removal on Cloudflare.
 *
 * POST /   body = the photo bytes (JPEG/PNG/WEBP/HEIC…)
 *          Authorization: Bearer <CUTOUT_SECRET>
 *   → 200 image/png, transparent background
 *   → JSON { error, code } otherwise
 *
 * Uses the Cloudflare Images binding with segment: "foreground" (BiRefNet
 * through Workers AI). Free plan: 5,000 unique transformations per month —
 * over the limit Cloudflare returns error 9422 and charges nothing.
 *
 * The secret keeps anyone else from spending the monthly quota; only the
 * backend (backgroundRemovalService.js) knows it.
 */

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Images binding error codes (see @cloudflare/workers-types ImagesBinding). */
const NOT_AN_IMAGE = 9412;
const FREE_LIMIT_REACHED = 9422;

function error(status, message, code = null) {
  return Response.json({ error: message, code }, { status });
}

/** Constant-time comparison, so the secret can't be guessed byte by byte. */
function sameSecret(given, expected) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return error(405, 'Use POST with the photo as the body.');
    if (!env.CUTOUT_SECRET) return error(503, 'CUTOUT_SECRET is not set on this Worker.');

    const auth = request.headers.get('authorization') || '';
    if (!sameSecret(auth, `Bearer ${env.CUTOUT_SECRET}`)) return error(401, 'Unauthorized.');

    const input = await request.arrayBuffer();
    if (input.byteLength === 0) return error(400, 'No photo in the request body.');
    if (input.byteLength > MAX_INPUT_BYTES) return error(413, 'Photo is larger than 15MB.');

    try {
      const result = await env.IMAGES.input(input).transform({ segment: 'foreground' }).output({ format: 'image/png' });
      return result.response();
    } catch (err) {
      console.error(`segment failed: ${err?.code ?? '-'} ${err?.message ?? err}`);
      if (err?.code === NOT_AN_IMAGE) return error(422, 'The photo could not be read.', err.code);
      if (err?.code === FREE_LIMIT_REACHED) return error(429, 'Monthly free background-removal limit reached.', err.code);
      return error(502, 'Background removal failed.', err?.code ?? null);
    }
  },
};
