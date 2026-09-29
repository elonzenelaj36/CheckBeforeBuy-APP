/**
 * Local discovery for "Where to find this": nearby physical stores and public
 * social-media business profiles, next to the existing online-store search
 * (webSearchService.js, unchanged).
 *
 * Only official SerpApi endpoints are used — nothing is scraped, crawled or
 * stored, no login is involved, and only what the search API publicly returns
 * (names, addresses, public profile/post URLs, short snippets) is shown:
 *   - nearby stores:    engine=google_maps (type=search), query = product
 *                       type + "store" + place. Verified 2026-09-29: the place
 *                       word in `q` returns real Prizren/Kosovo stores (no
 *                       `ll`/`location` needed, so no coordinates are sent).
 *   - social profiles:  engine=google restricted with site: to instagram.com,
 *                       facebook.com and tiktok.com. Google returns posts; the
 *                       profile is read from the returned URL / source label.
 *
 * Location is the coarse city the product check already uses (or none ->
 * Kosovo-wide). A result's location is judged from the address/coordinates
 * SerpApi returns, never assumed. Nothing here claims a store has the exact
 * product or states a price: availability must be confirmed with the store.
 *
 * Each search fails independently and returns a status; callers never fail
 * because of it.
 */

const {
  serpApiRequest,
  albanianTerm,
  productTypeWords,
  cityRegex,
  hostnameFromUrl,
  isHttpUrl,
  GEO_WORDS,
  SQ_TERMS,
} = require('./webSearchService');

const MAX_LOCAL = 5;
const MAX_SOCIAL = 5;
const ENOUGH_LOCAL = 3; // city results that make a Kosovo-wide map search unnecessary
// SerpApi sometimes takes 20-30 s (measured 2026-09-29: a site:-restricted
// Albanian query took 31.5 s). An aborted search still costs a credit, so these
// independent searches wait longer than the online search's 15 s, and the
// Kosovo-wide map fallback is only started while there is time left.
const DISCOVERY_TIMEOUT_MS = 30000;
const FALLBACK_START_LIMIT_MS = 15000;

// Kosovo's bounding box (approx.), to check a map result is actually in Kosovo.
const KOSOVO_BOX = { latMin: 41.85, latMax: 43.27, lngMin: 20.0, lngMax: 21.8 };

// Albanian "store type" word that makes social posts from shops (not homeowners) surface.
const SQ_CATEGORY_WORDS = { furniture: 'mobilje', electronics: 'elektronikë', appliances: 'elektroshtëpiake', lighting: 'ndriçim', decor: 'dekor' };

function isNoResults(err) {
  return /hasn't returned any results|no results/i.test(err.message || '');
}

/** The short English product noun ("armchair") from the name, else the category ("furniture"). */
function productNoun(name, category) {
  const lower = ` ${String(name || '').toLowerCase()} `;
  for (const [en] of SQ_TERMS) {
    if (lower.includes(` ${en} `) || lower.includes(` ${en}s `)) return en;
  }
  const cat = String(category || '').trim().toLowerCase();
  return cat && cat !== 'uncategorized' && cat !== 'other' ? cat : null;
}

function categoryWord(category) {
  const cat = String(category || '').toLowerCase();
  const key = Object.keys(SQ_CATEGORY_WORDS).find((k) => cat.includes(k));
  return key ? SQ_CATEGORY_WORDS[key] : null;
}

function inKosovo(gps) {
  if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') return null;
  return (
    gps.latitude >= KOSOVO_BOX.latMin &&
    gps.latitude <= KOSOVO_BOX.latMax &&
    gps.longitude >= KOSOVO_BOX.lngMin &&
    gps.longitude <= KOSOVO_BOX.lngMax
  );
}

/** Public Google Maps link to a place (documented Maps URLs format). */
function mapsUrl(place) {
  const params = new URLSearchParams({ api: '1', query: [place.title, place.address].filter(Boolean).join(', ') });
  if (place.place_id) params.set('query_place_id', place.place_id);
  return `https://www.google.com/maps/search/?${params}`;
}

const LOCALITY_LABEL = { city: 'Local', kosovo: 'Kosovo', unknown: null };

function emptyPrice() {
  return {
    price: null,
    originalPrice: null,
    priceMin: null,
    priceMax: null,
    currency: null,
    priceConfidence: 'none',
    variantDependent: false,
    priceComparisonAvailable: false,
    priceDifference: null,
    priceDifferencePercent: null,
  };
}

function normalizePlace(place, city) {
  if (!place || !place.title) return null;
  const kosovo = inKosovo(place.gps_coordinates);
  if (kosovo === false) return null; // outside Kosovo: not "nearby" for this app
  const address = place.address || null;
  const locality = city && address && cityRegex(city).test(address) ? 'city' : kosovo ? 'kosovo' : 'unknown';
  const types = Array.isArray(place.types) && place.types.length ? place.types : place.type ? [place.type] : [];
  const website = isHttpUrl(place.website) ? place.website : null;
  const rating = typeof place.rating === 'number' ? place.rating : null;
  const reviews = typeof place.reviews === 'number' ? place.reviews : null;

  const reason = [
    types[0] || 'Store',
    rating !== null ? `${rating}★${reviews !== null ? ` (${reviews} review${reviews === 1 ? '' : 's'})` : ''}` : null,
    'may sell this kind of product — availability not confirmed',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title: place.title,
    source: place.title,
    url: mapsUrl(place),
    website,
    address,
    phone: typeof place.phone === 'string' ? place.phone : null,
    rating,
    reviews,
    placeType: types[0] || null,
    sourceType: 'local_store',
    sourcePlatform: 'google_maps',
    locality,
    localityLabel: LOCALITY_LABEL[locality] ?? null,
    matchType: 'general',
    category: 'other',
    ...emptyPrice(),
    reason,
  };
}

/**
 * Nearby physical stores / showrooms via SerpApi Google Maps.
 * @returns {Promise<{status: 'ok'|'unavailable'|'skipped', stores: Array, queries: string[]}>}
 */
async function searchLocalStores({ name, category, city }) {
  const noun = productNoun(name, category);
  if (!noun) return { status: 'skipped', stores: [], queries: [] };

  const places = GEO_WORDS.test(String(name || '')) ? [null] : city ? [city, 'Kosovo'] : ['Kosovo'];
  const seen = new Set();
  const stores = [];
  const queries = [];
  let failures = 0;

  const startedAt = Date.now();
  for (const place of places) {
    if (queries.length + failures > 0 && Date.now() - startedAt > FALLBACK_START_LIMIT_MS) break;
    const q = `${noun} store${place ? ` ${place}` : ''}`;
    let body;
    try {
      body = await serpApiRequest({ engine: 'google_maps', type: 'search', q, hl: 'en' }, { timeoutMs: DISCOVERY_TIMEOUT_MS });
    } catch (err) {
      if (isNoResults(err)) {
        queries.push(q);
        continue;
      }
      console.error('[localDiscovery] maps search failed:', err.message);
      failures += 1;
      if (err.fatal) break;
      continue;
    }
    queries.push(q);
    const results = Array.isArray(body.local_results) ? body.local_results : body.place_results ? [body.place_results] : [];
    for (const r of results) {
      const key = r.place_id || `${r.title}|${r.address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = normalizePlace(r, city);
      if (s) stores.push(s);
    }
    if (stores.filter((s) => s.locality === 'city').length >= ENOUGH_LOCAL || place === null) break;
  }

  if (!queries.length && failures) return { status: 'unavailable', stores: [], queries };
  const rank = { city: 0, kosovo: 1, unknown: 2 };
  stores.sort((a, b) => rank[a.locality] - rank[b.locality] || (b.rating ?? 0) - (a.rating ?? 0));
  return { status: 'ok', stores: stores.slice(0, MAX_LOCAL), queries };
}

// ── Social profiles ─────────────────────────────────────────────────────────

const IG_NON_PROFILE = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'about', 'popular']);
const FB_NON_PROFILE = new Set([
  'groups', 'events', 'photo', 'photo.php', 'photos', 'watch', 'story.php', 'permalink.php', 'marketplace', 'share',
  'people', 'pages', 'profile.php', 'reel', 'videos', 'hashtag', 'login', 'help', 'media',
]);
const HANDLE = /^[A-Za-z0-9._-]{2,60}$/;

function platformOf(host) {
  if (/(^|\.)instagram\.com$/i.test(host)) return 'instagram';
  if (/(^|\.)facebook\.com$/i.test(host)) return 'facebook';
  if (/(^|\.)tiktok\.com$/i.test(host)) return 'tiktok';
  return null;
}

/** "Instagram · mobileria_arti_" -> "mobileria_arti_"; "Facebook · BERMAXX" -> "BERMAXX". */
function sourceLabelName(source) {
  const m = /·\s*(.+)$/.exec(String(source || ''));
  return m ? m[1].trim() : null;
}

/**
 * Public profile behind a search result, from its URL (or the handle Google
 * shows next to it). Returns null for results that aren't a business
 * profile or a post by one (groups, marketplace, events…).
 */
function profileFromResult(r) {
  if (!isHttpUrl(r.link)) return null;
  const host = hostnameFromUrl(r.link);
  const platform = host && platformOf(host);
  if (!platform) return null;
  const segments = new URL(r.link).pathname.split('/').filter(Boolean);
  const label = sourceLabelName(r.source);

  let handle = null;
  if (platform === 'instagram') {
    // Topic/search pages ("instagram.com/popular/poang-chair") are not a business or its post.
    if (['popular', 'explore'].includes((segments[0] || '').toLowerCase())) return null;
    if (segments[0] && !IG_NON_PROFILE.has(segments[0].toLowerCase())) handle = segments[0];
    else if (label && HANDLE.test(label)) handle = label;
    else {
      const m = /(?:^|\s)([A-Za-z0-9._]{3,30}) on [A-Z][a-z]+ \d{1,2}, \d{4}/.exec(r.snippet || '');
      if (m) handle = m[1];
    }
  } else if (platform === 'facebook') {
    if (segments[0] && FB_NON_PROFILE.has(segments[0].toLowerCase())) return null;
    if (segments[0]) handle = segments[0];
  } else if (segments[0] && segments[0].startsWith('@')) {
    handle = segments[0].slice(1);
  }
  if (handle && !HANDLE.test(handle)) handle = null;

  const profileUrl = handle
    ? platform === 'instagram'
      ? `https://www.instagram.com/${handle}/`
      : platform === 'facebook'
        ? `https://www.facebook.com/${handle}`
        : `https://www.tiktok.com/@${handle}`
    : null;

  return {
    platform,
    handle,
    displayName: (label && !/^(instagram|facebook|tiktok)$/i.test(label) ? label : null) || (handle ? `@${handle}` : null),
    profileUrl,
    postUrl: r.link,
  };
}

const PLATFORM_LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };

/**
 * Public Instagram/Facebook/TikTok business profiles via SerpApi Google search.
 * @returns {Promise<{status: 'ok'|'unavailable'|'skipped', profiles: Array, query: string|null}>}
 */
async function searchSocialProfiles({ name, category, city }) {
  const noun = productNoun(name, category);
  if (!noun) return { status: 'skipped', profiles: [], query: null };
  const sq = albanianTerm(noun);
  const catWord = categoryWord(category);
  const term = [sq || noun, catWord && !(sq || noun).includes(catWord) ? catWord : null].filter(Boolean).join(' ');
  const place = GEO_WORDS.test(String(name || '')) ? '' : ` ${city || (sq ? 'Kosovë' : 'Kosovo')}`;
  const query = `${term}${place} (site:instagram.com OR site:facebook.com OR site:tiktok.com)`;

  let body;
  try {
    body = await serpApiRequest({ engine: 'google', q: query, hl: sq ? 'sq' : 'en', num: '10' }, { timeoutMs: DISCOVERY_TIMEOUT_MS });
  } catch (err) {
    if (isNoResults(err)) return { status: 'ok', profiles: [], query };
    console.error('[localDiscovery] social search failed:', err.message);
    return { status: 'unavailable', profiles: [], query };
  }

  const typeWords = productTypeWords(name, category).map((w) => w.toLowerCase());
  const seen = new Set();
  const profiles = [];
  for (const r of Array.isArray(body.organic_results) ? body.organic_results : []) {
    const p = profileFromResult(r);
    if (!p) continue;
    const key = `${p.platform}|${(p.handle || p.postUrl).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const text = `${r.title || ''} ${r.snippet || ''}`;
    const mentionsProduct = typeWords.some((w) => text.toLowerCase().includes(w));
    const locality = city && cityRegex(city).test(text) ? 'city' : GEO_WORDS.test(text) ? 'kosovo' : 'unknown';
    // Neither about this kind of product nor about the place: noise (Google sometimes
    // returns unrelated accounts for the same query), not a local business profile.
    if (!mentionsProduct && locality === 'unknown') continue;
    const snippet = String(r.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 160) || null;

    profiles.push({
      title: p.displayName || 'Public post',
      source: PLATFORM_LABEL[p.platform],
      url: p.profileUrl || p.postUrl,
      linkKind: p.profileUrl ? 'profile' : 'post',
      postUrl: p.postUrl,
      handle: p.handle,
      snippet,
      sourceType: 'social_profile',
      sourcePlatform: p.platform,
      locality,
      localityLabel: LOCALITY_LABEL[locality] ?? null,
      // Never 'strong': a social post is not evidence of the exact product.
      matchType: mentionsProduct ? 'similar' : 'general',
      category: 'other',
      ...emptyPrice(),
      reason: [
        `Public ${PLATFORM_LABEL[p.platform]} ${p.profileUrl ? 'profile' : 'post'}`,
        mentionsProduct ? 'a public post mentions this kind of product' : 'business profile found by search',
        'contact them to confirm price and availability',
      ].join(' · '),
    });
  }

  const rank = { city: 0, kosovo: 1, unknown: 2 };
  const match = { similar: 0, general: 1 };
  const link = { profile: 0, post: 1 };
  profiles.sort(
    (a, b) => match[a.matchType] - match[b.matchType] || link[a.linkKind] - link[b.linkKind] || rank[a.locality] - rank[b.locality]
  );
  return { status: 'ok', profiles: profiles.slice(0, MAX_SOCIAL), query };
}

module.exports = { searchLocalStores, searchSocialProfiles, profileFromResult, normalizePlace, productNoun };
