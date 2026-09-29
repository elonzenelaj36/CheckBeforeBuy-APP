/**
 * Visual search — finds the SAME product as the user's photo on the web via
 * SerpApi's Google Lens API, with the prices those listings show.
 *
 * How the photo reaches Google Lens (no public server of ours involved):
 *   1. POST https://serpapi.com/image (multipart, JPEG ≤ 500 KB) → `image_id`.
 *      SerpApi keeps the upload for 10 minutes, then it expires. Uploading is
 *      free; verified 2026-09-29 (account usage unchanged after an upload).
 *   2. GET search.json?engine=google_lens&image_id=…&type=all → one search credit.
 *   The API key stays on the backend; the app never sees it.
 *
 * Verified behaviour (2026-09-29, real calls):
 *   - `country=xk` returns no visual matches; `country=de` returns the same
 *     product with EUR prices (e.g. IKEA POÄNG: IKEA Germany €79–€179), so the
 *     default is a euro country (LENS_COUNTRY, default "de").
 *   - `related_content[].query` names what Lens recognised ("IKEA POÄNG
 *     armchair"). It is trusted only when that name's distinctive words also
 *     appear in several matched listing titles.
 *   - Prices come only from Lens's structured `price` field (Google marks them
 *     "*": may vary). Nothing is read from the listing pages themselves.
 *
 * A listing is "strong" (same model) only when its title carries the
 * recognised model's distinctive words; otherwise it is "similar" (looks like
 * it). Colour/size variants can still differ — callers say so.
 */

const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const env = require('../config/env');
const {
  isConfigured,
  serpApiRequest,
  localityOf,
  isHttpUrl,
  hostnameFromUrl,
  SKIPPED_DOMAINS,
  SQ_TERMS,
} = require('./webSearchService');
const { profileFromResult } = require('./localDiscoveryService');

const UPLOAD_URL = 'https://serpapi.com/image';
const UPLOAD_MAX_BYTES = 500 * 1024;
const UPLOAD_TIMEOUT_MS = 20000;
const LENS_TIMEOUT_MS = 30000;
const MAX_ONLINE = 8;
const MAX_SOCIAL = 4;
const MIN_TITLES_FOR_IDENTITY = 2;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 50;
const cache = new Map(); // photo hash|city -> { at, result }

const SOCIAL_HOST = /(^|\.)(instagram\.com|facebook\.com|tiktok\.com)$/i;
const CURRENCY_SYMBOLS = { '€': 'EUR', $: 'USD', 'US$': 'USD', 'A$': 'AUD', 'C$': 'CAD', '£': 'GBP', 'CHF': 'CHF', 'zł': 'PLN', 'kr': 'SEK', 'Lekë': 'ALL', 'L': 'ALL', 'ден': 'MKD' };

// Words that describe a KIND of product, not a specific model.
const GENERIC = new Set([
  ...SQ_TERMS.flatMap(([en]) => en.split(' ')),
  'furniture', 'set', 'with', 'and', 'for', 'the', 'modern', 'classic', 'vintage', 'new', 'used', 'black', 'white', 'brown',
  'gray', 'grey', 'beige', 'blue', 'green', 'red', 'yellow', 'dark', 'light', 'wood', 'wooden', 'leather', 'fabric',
  'metal', 'velvet', 'oak', 'walnut', 'birch', 'recliner', 'reclining', 'ottoman', 'stool', 'seat', 'seater', 'corner',
  'office', 'living', 'room', 'bedroom', 'kitchen', 'chairs', 'tables', 'sale', 'buy', 'price', 'cheap', 'best',
]);

/** Lower-case, accents removed ("POÄNG" -> "poang"), split into words. */
function words(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

function distinctiveWords(name) {
  return [...new Set(words(name).filter((w) => w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w)))];
}

/** Resized JPEG under SerpApi's 500 KB upload limit. */
async function uploadableJpeg(absolutePath) {
  for (const [side, quality] of [[1000, 82], [800, 75], [640, 70], [512, 65]]) {
    const buf = await sharp(absolutePath).rotate().resize(side, side, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
    if (buf.length <= UPLOAD_MAX_BYTES) return buf;
  }
  throw new Error('Could not make the photo small enough for visual search.');
}

async function uploadImage(absolutePath) {
  const form = new FormData();
  form.append('image', new Blob([await uploadableJpeg(absolutePath)], { type: 'image/jpeg' }), 'product.jpg');
  form.append('api_key', env.search.apiKey);
  let response;
  try {
    response = await fetch(UPLOAD_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  } catch (err) {
    throw new Error(`SerpApi image upload failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  }
  const body = await response.json().catch(() => null);
  // Never include the request (it carries the key) in the message.
  if (!response.ok || !body?.image_id) throw new Error(`SerpApi image upload failed: HTTP ${response.status} ${body?.error || ''}`.trim());
  return body.image_id;
}

function parsePrice(price) {
  if (!price || typeof price !== 'object') return null;
  const value = Number(price.extracted_value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const symbol = String(price.currency || '').trim();
  const currency = CURRENCY_SYMBOLS[symbol] || (/^[A-Z]{3}$/.test(symbol) ? symbol : null);
  if (!currency) return null;
  return { value, currency, text: String(price.value || '').trim() || null };
}

/**
 * What Lens recognised, trusted only when its distinctive words (e.g. "poang")
 * show up in at least two matched listing titles.
 */
function recognise(relatedContent, titles) {
  const titleWords = titles.map((t) => new Set(words(t)));
  let best = null;
  for (const r of Array.isArray(relatedContent) ? relatedContent : []) {
    const name = String(r?.query || '').trim();
    const distinct = distinctiveWords(name);
    if (!name || !distinct.length) continue;
    const support = titleWords.filter((set) => distinct.every((w) => set.has(w))).length;
    // Tie-break on the whole name (incl. "armchair" vs "ottoman"): the kind most listings are.
    const all = words(name).filter((w) => w.length > 2);
    const fullSupport = titleWords.filter((set) => all.every((w) => set.has(w))).length;
    if (!best || support > best.support || (support === best.support && fullSupport > best.fullSupport)) {
      best = { name, distinct, support, fullSupport };
    }
  }
  if (!best || best.support < MIN_TITLES_FOR_IDENTITY) return null;
  return best;
}

/**
 * @returns {Promise<{status:'ok'|'unavailable'|'not_configured', identity: string|null,
 *   matches: Array, social: Array}>} — `matches` use webSearchService's normalized shape
 *   (+ sourceType/sourcePlatform), `social` localDiscoveryService's social shape.
 */
async function searchByImage(absoluteImagePath, { city = null } = {}) {
  if (!isConfigured()) return { status: 'not_configured', identity: null, matches: [], social: [] };

  // The same photo analysed again within a day reuses the result (no credits spent).
  let cacheKey = null;
  try {
    cacheKey = `${crypto.createHash('sha256').update(fs.readFileSync(absoluteImagePath)).digest('hex')}|${city || ''}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      console.log('[visualSearch] same photo analysed recently: reusing Lens results');
      return hit.result;
    }
  } catch {
    cacheKey = null;
  }

  let imageId;
  try {
    imageId = await uploadImage(absoluteImagePath);
  } catch (err) {
    console.error('[visualSearch] Google Lens failed:', err.message);
    return { status: 'unavailable', identity: null, matches: [], social: [] };
  }

  // Two searches on the same upload: the product on the web, and the same
  // photo steered to Instagram with q=instagram (verified 2026-09-29: returns
  // Instagram posts of the same product; more words than that returned nothing).
  const lens = (extra) =>
    serpApiRequest(
      { engine: 'google_lens', image_id: imageId, type: 'all', hl: 'en', country: env.search.lensCountry || 'de', ...extra },
      { timeoutMs: LENS_TIMEOUT_MS }
    ).catch((err) => {
      if (/hasn't returned any results/i.test(err.message)) return {};
      throw err;
    });
  const [web, insta] = await Promise.allSettled([lens({}), lens({ q: 'instagram' })]);
  if (web.status === 'rejected') console.error('[visualSearch] Google Lens failed:', web.reason?.message);
  if (insta.status === 'rejected') console.error('[visualSearch] Google Lens (social) failed:', insta.reason?.message);
  if (web.status === 'rejected' && insta.status === 'rejected') {
    return { status: 'unavailable', identity: null, matches: [], social: [] };
  }

  const main = web.status === 'fulfilled' ? normalizeLens(web.value, { city }) : { identity: null, matches: [], social: [] };
  const extraSocial = insta.status === 'fulfilled' ? normalizeLens(insta.value, { city, maxSocial: 10 }).social : [];
  // Posts that mention Kosovo/the city first (a local salon), then the rest; one per post.
  const seen = new Set();
  const rank = { city: 0, kosovo: 1, regional: 2 };
  const social = [...main.social, ...extraSocial]
    .filter((p) => (seen.has(p.postUrl) ? false : seen.add(p.postUrl)))
    .sort((a, b) => (rank[a.locality] ?? 3) - (rank[b.locality] ?? 3))
    .slice(0, MAX_SOCIAL);

  const result = { status: 'ok', identity: main.identity, matches: main.matches, social };
  console.log(`[visualSearch] social image matches: ${social.length} (${social.filter((p) => (rank[p.locality] ?? 3) < 3).length} local)`);
  if (cacheKey) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { at: Date.now(), result });
  }
  return result;
}

/** Lens response → recognised name + normalized listings and social posts (pure; tested on saved responses). */
function normalizeLens(body, { city = null, maxSocial = MAX_SOCIAL } = {}) {
  const visual = Array.isArray(body.visual_matches) ? body.visual_matches : [];
  const identity = recognise(body.related_content, visual.slice(0, 20).map((v) => v.title));

  const matches = [];
  const social = [];
  const seen = new Set();
  for (const v of visual) {
    if (!isHttpUrl(v.link) || !v.title) continue;
    const key = v.link.replace(/[#?].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const host = hostnameFromUrl(v.link) || '';
    const titleSet = new Set(words(v.title));
    const sameModel = !!identity && identity.distinct.every((w) => titleSet.has(w));

    if (SOCIAL_HOST.test(host)) {
      if (social.length >= maxSocial) continue;
      const p = profileFromResult({ link: v.link, source: v.source, snippet: '' });
      if (!p) continue;
      social.push({
        title: p.displayName || `${{ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' }[p.platform]} post`,
        source: v.source || null,
        url: p.postUrl, // the matching post itself: it shows the product
        linkKind: 'post',
        postUrl: p.postUrl,
        profileUrl: p.profileUrl,
        handle: p.handle,
        snippet: String(v.title).slice(0, 160),
        sourceType: 'social_profile',
        sourcePlatform: p.platform,
        locality: localityOf({ url: v.link, title: v.title, snippet: '' }, city),
        localityLabel: null,
        matchType: 'similar',
        category: 'other',
        price: null, originalPrice: null, priceMin: null, priceMax: null, currency: null, priceConfidence: 'none',
        variantDependent: false, priceComparisonAvailable: false, priceDifference: null, priceDifferencePercent: null,
        imageMatch: true,
        reason: 'Image match: this public post shows a product that looks like yours · contact them to confirm price and availability',
      });
      continue;
    }
    if (SKIPPED_DOMAINS.test(host) || matches.length >= MAX_ONLINE) continue;

    const price = parsePrice(v.price);
    matches.push({
      store: v.source || host,
      pageTitle: v.title,
      url: v.link,
      snippet: '',
      price: price ? price.value : null,
      originalPrice: null,
      priceMin: null,
      priceMax: null,
      currency: price ? price.currency : null,
      // Google marks Lens prices "*" (may vary), and variants can differ: never "high".
      priceConfidence: price ? 'medium' : 'none',
      priceSource: price ? 'google_lens' : null,
      priceText: price ? price.text : null,
      variantDependent: false,
      imageUrl: typeof v.thumbnail === 'string' ? v.thumbnail : null,
      location: null,
      matchType: sameModel ? 'strong' : 'similar',
      locality: localityOf({ url: v.link, title: v.title, snippet: '' }, city),
      searchScope: 'lens',
      imageMatch: true,
    });
  }

  // Same-model listings first, then priced ones, in Lens's own order otherwise.
  matches.sort((a, b) => (a.matchType === 'strong' ? 0 : 1) - (b.matchType === 'strong' ? 0 : 1) || (a.price === null) - (b.price === null));

  console.log(
    `[visualSearch] Lens: ${visual.length} visual matches → ${matches.length} listings (${matches.filter((m) => m.matchType === 'strong').length} same model, ${matches.filter((m) => m.price !== null).length} priced), ${social.length} social; recognised: ${identity ? identity.name : '-'}`
  );
  return { identity: identity ? identity.name : null, matches, social };
}

module.exports = { searchByImage, normalizeLens, recognise, distinctiveWords, parsePrice, words };
