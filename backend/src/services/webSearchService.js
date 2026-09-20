/**
 * Web product search via SerpApi (Google Search engine).
 *
 * Turns the product already identified by the AI analysis into a short
 * search query, asks SerpApi for real Google results, and returns links to
 * the ORIGINAL pages — nothing is scraped, proxied, stored or cataloged.
 *
 * Location: search widens step by step (city -> Kosovo -> plain web) and
 * stops widening once enough LOCAL results were found. Geography is
 * expressed only as words in the query (city/country name); no coordinates
 * or IP are ever sent to SerpApi. SerpApi has no Kosovo `gl` code, and its
 * `location` parameter was tested and gave worse, unstable results, so
 * neither is used. What does work: Albanian product terms + "Kosovë" — they
 * surface real Kosovo retailers that English queries never reach.
 *
 * Each result gets a `locality` (city | kosovo | regional | unknown |
 * international) based only on evidence in the result itself (domain
 * country code, title/snippet text). Results are ordered local-first.
 *
 * Prices are only returned when SerpApi supplies one for that result
 * (shopping results / rich-snippet offers); otherwise null.
 */

const env = require('../config/env');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 15000;
const MAX_RESULTS = 8;
const MIN_LOCAL_RESULTS = 3;
const STRONG_CONFIDENCE = 0.7;

// Aggregators that rarely give a direct product page.
const SKIPPED_DOMAINS = /(^|\.)(pinterest\.[a-z.]+|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|reddit\.com|quora\.com|wikipedia\.org|linkedin\.com|booking\.com|tripadvisor\.[a-z.]+|indeed\.com|techbehemoths\.com)$/i;

function isConfigured() {
  return env.search.provider === 'serpapi' && !!env.search.apiKey;
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/**
 * Short query from structured fields only (never the description).
 * Brand is used only when confidence is reasonable; it is skipped if the
 * name already contains it.
 */
function buildBaseQuery({ name, brand, category, confidence }) {
  const parts = [];
  const cleanName = name && name !== 'Unknown product' ? name.trim() : '';
  if (cleanName) parts.push(cleanName);

  if (brand && confidence != null && confidence >= 0.6 && !cleanName.toLowerCase().includes(brand.toLowerCase())) {
    parts.unshift(brand.trim());
  }
  if (category && category !== 'Uncategorized' && cleanName.split(' ').length < 3 && !cleanName.toLowerCase().includes(category.toLowerCase())) {
    parts.push(category.trim());
  }
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 100).trim();
}


// Common product nouns -> Albanian. Longest phrases first. Only used to build
// an extra Kosovo-market query; unknown products simply skip that step.
const SQ_TERMS = [
  ['office chair', 'karrige zyre'], ['gaming chair', 'karrige gaming'], ['dining chair', 'karrige ngrënie'],
  ['armchair', 'kolltuk'], ['chair', 'karrige'], ['sofa', 'divan'], ['couch', 'divan'],
  ['coffee table', 'tavolinë kafeje'], ['dining table', 'tavolinë ngrënie'], ['desk', 'tavolinë pune'],
  ['table', 'tavolinë'], ['bookshelf', 'raft librash'], ['shelf', 'raft'], ['wardrobe', 'dollap rrobash'],
  ['nightstand', 'komodinë'], ['bed', 'shtrat'], ['mattress', 'dyshek'], ['rug', 'qilim'], ['carpet', 'qilim'],
  ['floor lamp', 'llambë dyshemeje'], ['lamp', 'llambë'], ['mirror', 'pasqyrë'], ['curtain', 'perde'],
  ['refrigerator', 'frigorifer'], ['fridge', 'frigorifer'], ['washing machine', 'lavatriçe'],
  ['dishwasher', 'enëlarëse'], ['microwave', 'mikrovalë'], ['oven', 'furrë'], ['vacuum cleaner', 'fshesë me korrent'],
  ['air conditioner', 'klimë'], ['heater', 'ngrohëse'], ['television', 'televizor'], ['tv', 'televizor'],
  ['smartphone', 'telefon'], ['phone', 'telefon'], ['laptop', 'laptop'], ['tablet', 'tablet'],
  ['monitor', 'monitor'], ['keyboard', 'tastierë'], ['mouse', 'maus'], ['headphones', 'kufje'],
  ['speaker', 'altoparlant'], ['camera', 'kamerë'], ['watch', 'orë'], ['sneakers', 'atlete'],
  ['shoes', 'këpucë'], ['boots', 'çizme'], ['jacket', 'jakë'], ['coat', 'pallto'], ['jeans', 'xhinse'],
  ['blender', 'mikser'], ['coffee machine', 'makinë kafeje'], ['hair dryer', 'tharëse flokësh'],
  ['backpack', 'çantë shpine'], ['bag', 'çantë'],
];
const SQ_ADJ = { ergonomic: 'ergonomike' };

function albanianTerm(base) {
  const lower = ` ${base.toLowerCase()} `;
  for (const [en, sq] of SQ_TERMS) {
    if (lower.includes(` ${en} `) || lower.includes(` ${en}s `)) {
      const adj = Object.entries(SQ_ADJ).filter(([e]) => lower.includes(` ${e} `)).map(([, a]) => a);
      return [sq, ...adj].join(' ');
    }
  }
  return null;
}

const GEO_WORDS = /(?<!\p{L})(kosovo|kosova|kosov[eë]|prizren|prishtina|prishtin[eë]|pristina|peja|pej[eë]|gjakova|gjakov[eë]|ferizaj|gjilan|mitrovica|mitrovic[eë])(?!\p{L})/iu;

/**
 * Ordered search attempts, most local first. Each step is a wider net; the
 * caller stops once enough local results were found.
 */
function buildQueryPlan(base, city, brand) {
  if (GEO_WORDS.test(base)) return [{ scope: 'as-is', q: base }];
  const sq = albanianTerm(base);
  const sqQuery = sq ? `${brand && base.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ` : ''}${sq}` : null;

  const plan = [];
  if (city && sqQuery) plan.push({ scope: 'city', q: `${sqQuery} ${city}`, hl: 'sq' });
  if (sqQuery) plan.push({ scope: 'kosovo', q: `${sqQuery} Kosovë`, hl: 'sq' });
  if (city && !sqQuery) plan.push({ scope: 'city', q: `${base} ${city} Kosovo` });
  plan.push({ scope: 'kosovo', q: `${base} Kosovo` });
  plan.push({ scope: 'web', q: base });
  return plan;
}

// ── Locality evidence ──────────────────────────────────────────────────────
const KOSOVO_TLDS = /\.(xk|ks)$/i;
const KOSOVO_HOST_HINT = /(kosov|prishtin|pristina|prizren|-ks\b|ks-)/i;
const REGIONAL_TLDS = /\.(al|mk|me|rs|ba|hr|si)$/i;
// Country-code TLDs of clearly non-local markets. Generic TLDs (.com/.eu/.net/.org/.store...) say nothing.
const FOREIGN_TLDS = /\.(ae|sa|de|uk|us|fr|it|es|nl|be|at|ch|pl|cz|ro|bg|gr|tr|ge|ru|ua|in|cn|jp|kr|au|ca|br|mx|eg|pk|ir|se|no|dk|fi|pt|ie|hu|sk|lt|lv|ee)$/i;
// Albanian-language marker (Kosovo + Albania share it): weaker than a Kosovo mention, so it only
// counts as "regional" — never claimed as Kosovo.
const ALBANIAN_MARKERS = /(karrig|tavolin|divan|shtrat|dyshek|[cç]mim|blej|shitje|shpallje|porosit|mobilje|shtëpi|shtepi|zyr[eë]|kolltuk|dollap|televizor|\/sq(\/|$|\?))/i;
const REGIONAL_NAMES = /(?<!\p{L})(shqip[eë]ri|albania|tirana|tiran[eë]|durr[eë]s|shkup|skopje|maqedoni|north macedonia|tetovo|podgorica|mali i zi|montenegro)(?!\p{L})/iu;

function localityOf({ url, title, snippet, location }, city) {
  const host = hostnameFromUrl(url) || '';
  const text = `${title || ''} ${snippet || ''} ${location || ''}`;

  if (city && new RegExp(`(?<!\\p{L})${city.replace(/[^\p{L}0-9 ]/gu, '')}(?!\\p{L})`, 'iu').test(text)) return 'city';
  if (KOSOVO_TLDS.test(host) || KOSOVO_HOST_HINT.test(host) || GEO_WORDS.test(text)) return 'kosovo';
  if (REGIONAL_TLDS.test(host) || REGIONAL_NAMES.test(text) || ALBANIAN_MARKERS.test(`${text} ${url}`)) return 'regional';
  if (FOREIGN_TLDS.test(host)) return 'international';
  return 'unknown';
}

function priceFromOffer(item) {
  // Only trust prices SerpApi returned as structured data on that result.
  const offer = item.rich_snippet?.top?.detected_extensions?.price != null
    ? {
        value: item.rich_snippet.top.detected_extensions.price,
        currency: item.rich_snippet.top.detected_extensions.currency || null,
      }
    : null;
  if (offer && Number.isFinite(Number(offer.value))) {
    return { price: Number(offer.value), currency: offer.currency };
  }
  return { price: null, currency: null };
}

function classifyMatch(title, snippet, { name, brand, confidence }) {
  const haystack = `${title || ''} ${snippet || ''}`.toLowerCase();
  const brandHit = brand && haystack.includes(brand.toLowerCase());
  const coverageOf = (list) => (list.length ? list.filter((t) => haystack.includes(t)).length / list.length : 0);
  // Kosovo pages are usually Albanian, so also compare against the Albanian product term.
  const sq = albanianTerm(name || '');
  const coverage = Math.max(coverageOf(tokens(name)), sq ? coverageOf(tokens(sq)) : 0);

  // "strong" requires a confidently detected brand AND real title overlap;
  // a title that merely resembles the category is only "similar".
  if (brandHit && confidence != null && confidence >= STRONG_CONFIDENCE && coverage >= 0.6) return 'strong';
  if (coverage >= 0.5) return 'similar';
  return 'general';
}

async function callSerpApi(q, hl = 'en') {
  const params = new URLSearchParams({
    engine: 'google',
    q,
    hl,
    num: '10',
    api_key: env.search.apiKey,
  });

  let response;
  try {
    response = await fetch(`${SERPAPI_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`SerpApi request timed out after ${TIMEOUT_MS}ms`);
    }
    throw new Error(`SerpApi request failed: ${err.message}`);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    // Never include the request URL (it contains the key) in the message.
    const err = new Error(`SerpApi error ${response.status}: ${body?.error || 'unknown error'}`);
    err.fatal = [401, 403, 429].includes(response.status); // retrying a wider query cannot help
    throw err;
  }
  return body;
}

function normalize(body, product, city) {
  const out = [];

  // Shopping results give the most reliable structured prices.
  for (const item of body.shopping_results || []) {
    const url = item.product_link || item.link;
    if (!isHttpUrl(url)) continue;
    out.push({
      store: item.source || hostnameFromUrl(url),
      pageTitle: item.title || null,
      url,
      snippet: null,
      price: Number.isFinite(Number(item.extracted_price)) ? Number(item.extracted_price) : null,
      currency: null, // SerpApi gives a display string ("€49.00"), not a code — never guessed
      priceText: item.price || null,
      imageUrl: item.thumbnail || null,
      location: item.location || null,
      matchType: classifyMatch(item.title, '', product),
      locality: localityOf({ url, title: item.title, location: item.location }, city),
    });
  }

  for (const item of body.organic_results || []) {
    if (!isHttpUrl(item.link)) continue;
    const host = hostnameFromUrl(item.link);
    if (!host || SKIPPED_DOMAINS.test(host)) continue;
    const { price, currency } = priceFromOffer(item);
    out.push({
      store: item.source || host,
      pageTitle: item.title || null,
      url: item.link,
      snippet: item.snippet || null,
      price,
      currency,
      priceText: null,
      imageUrl: item.thumbnail || null,
      location: null,
      matchType: classifyMatch(item.title, item.snippet, product),
      locality: localityOf({ url: item.link, title: item.title, snippet: item.snippet }, city),
    });
  }

  return out;
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {string|null} [params.brand]
 * @param {string|null} [params.category]
 * @param {number|null} [params.confidence]
 * @param {string|null} [params.city] - coarse location only
 */
async function searchProductWeb({ name, brand, category, confidence, city }) {
  const product = { name, brand, category, confidence };
  const base = buildBaseQuery(product);
  if (!base) {
    return { isMock: false, provider: 'serpapi', query: null, matches: [] };
  }

  const LOCAL = new Set(['city', 'kosovo']);
  const seen = new Set();
  const matches = [];
  const scopesUsed = [];
  let lastError = null;

  for (const step of buildQueryPlan(base, city, brand)) {
    let body;
    try {
      body = await callSerpApi(step.q, step.hl);
    } catch (err) {
      console.error(`[webSearch] "${step.scope}" search failed:`, err.message);
      lastError = err;
      if (err.fatal) break;
      continue;
    }
    scopesUsed.push(step.scope);

    for (const m of normalize(body, product, city)) {
      const key = m.url.replace(/[#?].*$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ ...m, searchScope: step.scope });
    }
    if (matches.filter((m) => LOCAL.has(m.locality)).length >= MIN_LOCAL_RESULTS) break; // enough local results
  }

  if (matches.length === 0 && lastError) throw lastError;

  // Local first; within a locality, better product match first. Results
  // whose title/snippet barely correspond to the product ("general") are
  // dropped entirely — a short list of useful results beats a padded one.
  const localityRank = { city: 0, kosovo: 1, regional: 2, unknown: 3, international: 4 };
  const matchRank = { strong: 0, similar: 1, general: 2 };
  const useful = matches.filter((m) => m.matchType !== 'general');
  useful.sort((a, b) => localityRank[a.locality] - localityRank[b.locality] || matchRank[a.matchType] - matchRank[b.matchType]);
  matches.length = 0;
  matches.push(...useful);

  console.log(`[webSearch] "${base}" -> ${matches.length} results [${['city','kosovo','regional','unknown','international'].map((l) => `${l}:${matches.filter((m) => m.locality === l).length}`).join(' ')}] (scopes: ${scopesUsed.join(', ') || 'none'})`);

  return {
    isMock: false,
    provider: 'serpapi',
    query: base,
    matches: matches.slice(0, MAX_RESULTS),
  };
}

module.exports = { isConfigured, searchProductWeb, buildBaseQuery, buildQueryPlan };
