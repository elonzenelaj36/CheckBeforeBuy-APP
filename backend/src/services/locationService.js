/**
 * Approximate user location for "Find for My Home" — used only to prioritize
 * product/store results by rough proximity (country/region/city), never for
 * anything requiring precision.
 *
 * IMPORTANT: a private/loopback address (192.168.x.x, 10.x.x.x, 127.0.0.1,
 * ::1, etc.) is NOT a geographic location — it's a local network address, and
 * is never sent to a geolocation lookup. In local development the request's
 * IP is almost always private, so this correctly resolves to "unknown"
 * rather than a fabricated location; a real deployment behind a public IP
 * (or a reverse proxy forwarding the real client IP) is what makes IP
 * geolocation actually useful.
 *
 * IP geolocation here is best-effort only: no API key is required (a free,
 * keyless provider), it's given a short timeout, and any failure resolves to
 * `null` rather than throwing — callers must already have a manual
 * city-selection fallback (see findForMyHomeController.js).
 *
 * Nothing here is persisted: the IP is used only for the duration of this
 * lookup and is never written to the database or logged.
 */

const PRIVATE_IPV4_PREFIXES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

function stripIpv6Prefix(ip) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isPrivateOrLoopbackIp(ip) {
  if (!ip) return true;

  const normalized = stripIpv6Prefix(ip.trim());

  if (normalized === '::1' || normalized === 'localhost') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true; // IPv6 unique local (fc00::/7)
  if (/^fe80:/i.test(normalized)) return true; // IPv6 link-local

  return PRIVATE_IPV4_PREFIXES.some((re) => re.test(normalized));
}

/**
 * Best-effort client IP extraction. Trusts X-Forwarded-For only as a hint —
 * this backend does not run `trust proxy`, so req.ip is the direct socket
 * peer unless a deployment explicitly configures Express to trust a proxy.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

const LOOKUP_TIMEOUT_MS = 2000;

/**
 * @param {string|null} ip
 * @returns {Promise<{country: string|null, region: string|null, city: string|null} | null>}
 */
async function getApproximateLocationFromIp(ip) {
  if (isPrivateOrLoopbackIp(ip)) {
    return null;
  }

  if (typeof fetch !== 'function') {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
      { signal: controller.signal }
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 'success') return null;

    return {
      country: data.country || null,
      region: data.regionName || null,
      city: data.city || null,
    };
  } catch {
    // Network failure, timeout, or malformed response — treat as unknown
    // rather than blocking the recommendation request on it.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getApproximateLocationFromIp, getClientIp, isPrivateOrLoopbackIp };
