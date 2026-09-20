/**
 * Web product search via SerpApi (Google Search engine).
 *
 * Turns the product already identified by the AI analysis into a short
 * search query, asks SerpApi for real Google results, and returns links to
 * the ORIGINAL pages — nothing is scraped, proxied, stored or cataloged.
 *
 * Location (progressive, never mixed early): CITY -> COUNTRY (Kosovo) ->
 * REGION (Albania, North Macedonia, Montenegro, one at a time) -> broad.
 * A level is searched only if the previous ones did not yield enough
 * useful results, and results from levels beyond the one we stopped at are
 * not returned. Geography is expressed as words in the query only (city /
 * country name); no coordinates or IP go to SerpApi. SerpApi's `location`
 * parameter was tested (Kosovo, Prizren District) and returned unrelated or
 * US results, and there is no Kosovo `gl` code, so neither is used.
 *
 * Each result gets a `locality` from evidence in the result itself
 * (title, snippet, URL path, structured location):
 *   city | kosovo (= COUNTRY) | regional | international | unknown
 * A TLD alone never decides locality, and a query containing "Prizren"
 * never makes a result "from Prizren".
 *
 * Prices are only returned when SerpApi supplies one for that result
 * (shopping results / rich-snippet offers); otherwise null.
 */

const env = require('../config/env');
const { extractPrice } = require('./priceExtraction');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 15000;
const MAX_RESULTS = 10;
const ENOUGH_RESULTS = 3; // useful results at a level that make widening unnecessary
const MAX_SEARCHES = 6; // SerpApi calls per analysis
const BROAD_CAP = 6; // total list size once the broad fallback was needed
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
 * Geographic levels, searched in this order and only as far as needed.
 * Each level has one or two queries; the product query itself is never
 * rewritten — only a place name is appended. An Albanian-language variant of
 * the same level is tried second, because English queries mostly surface
 * foreign shops while Albanian ones reach Kosovo/Albanian retailers.
 */
function buildLevels(base, city, brand) {
  if (GEO_WORDS.test(base)) return [{ id: 'country', queries: [{ q: base }] }]; // query already names a place
  const sq = albanianTerm(base);
  const sqQuery = sq ? `${brand && base.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ` : ''}${sq}` : null;
  const variant = (place, sqPlace) => [{ q: `${base} ${place}` }, ...(sqQuery ? [{ q: `${sqQuery} ${sqPlace}`, hl: 'sq' }] : [])];

  const levels = [];
  if (city) levels.push({ id: 'city', queries: variant(city, city) });
  levels.push({ id: 'country', queries: variant('Kosovo', 'Kosovë') });
  levels.push({ id: 'albania', queries: variant('Albania', 'Shqipëri') });
  levels.push({ id: 'north-macedonia', queries: [{ q: `${base} North Macedonia` }] });
  levels.push({ id: 'montenegro', queries: [{ q: `${base} Montenegro` }] });
  levels.push({ id: 'broad', queries: [{ q: base }] });
  return levels;
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

function cityRegex(city) {
  return new RegExp(`(?<!\\p{L})${city.replace(/[^\p{L}0-9 ]/gu, '')}(?!\\p{L})`, 'iu');
}

function safeDecode(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/**
 * Evidence-based locality. Evidence sources: title, snippet, structured
 * location, and the result's own URL (host/path). A TLD by itself is not
 * evidence of where a store is: .al/.mk/.me only count together with a
 * second signal; only clearly foreign country-code TLDs push a result down
 * to "international" (which can only lower its ranking).
 */
function localityOf({ url, title, snippet, location }, city) {
  const host = hostnameFromUrl(url) || '';
  const text = `${title || ''} ${snippet || ''} ${location || ''} ${safeDecode(url || '')}`;

  if (city && cityRegex(city).test(text)) return 'city';
  if (KOSOVO_TLDS.test(host) || KOSOVO_HOST_HINT.test(host) || GEO_WORDS.test(text) || /\+383/.test(text)) return 'kosovo';
  const regionalName = REGIONAL_NAMES.test(text);
  const weakRegional = REGIONAL_TLDS.test(host) && (regionalName || ALBANIAN_MARKERS.test(text));
  if (regionalName || weakRegional) return 'regional';
  if (FOREIGN_TLDS.test(host)) return 'international';
  return 'unknown'; // includes Albanian-language pages with no stated location
}

// Words that describe a kind of product rather than a specific model.
const GENERIC_WORDS = new Set([
  'black', 'white', 'grey', 'gray', 'brown', 'blue', 'red', 'green', 'beige', 'silver', 'gold', 'pink',
  'ergonomic', 'mesh', 'leather', 'wooden', 'wood', 'metal', 'plastic', 'fabric', 'modern', 'adjustable',
  'smart', 'inch', 'set', 'with', 'and', 'for', 'the', 'high', 'low', 'small', 'large', 'big',
]);

function classifyMatch(title, snippet, { name, brand, confidence }) {
  const haystack = `${title || ''} ${snippet || ''}`.toLowerCase();
  const brandHit = brand && haystack.includes(brand.toLowerCase());
  const coverageOf = (list) => (list.length ? list.filter((t) => haystack.includes(t)).length / list.length : 0);
  // Kosovo pages are usually Albanian, so also compare against the Albanian product term.
  const sq = albanianTerm(name || '');
  const coverage = Math.max(coverageOf(tokens(name)), sq ? coverageOf(tokens(sq)) : 0);

  // "strong" (possible exact match) needs a confidently detected brand AND a
  // distinctive model-like token from the name (not a colour/material/type
  // word) that appears in the result. Brand + category alone is only "similar".
  const typeStems = new Set(productTypeWords(name, '').map((w) => w.toLowerCase()));
  const distinctive = tokens(name).filter(
    (t) => !GENERIC_WORDS.has(t) && !tokens(brand).includes(t) && ![...typeStems].some((w) => t.startsWith(w))
  );
  if (brandHit && confidence != null && confidence >= STRONG_CONFIDENCE && distinctive.length > 0 && coverageOf(distinctive) === 1) {
    return 'strong';
  }
  if (coverage >= 0.5) return 'similar';
  return 'general';
}

// ── Relevance filters ──────────────────────────────────────────────────────
const NON_PRODUCT_TITLE = /\b(how to|how do|guide|tips|review[s]?|best \d+|top \d+|vs\.?|versus|repair|fix|clean(ing)?|tutorial|diy|news|blog|jobs?|hiring|wikipedia)\b/i;

/** Product-type words (EN + SQ) that a result must mention to be comparable. */
function productTypeWords(name, category) {
  const lower = ` ${String(name || '').toLowerCase()} `;
  for (const [en, sq] of SQ_TERMS) {
    if (lower.includes(` ${en} `) || lower.includes(` ${en}s `)) return [en, ...sq.split(' ').filter((w) => w.length > 3).slice(0, 1)].map((w) => w.slice(0, Math.max(4, w.length - 1)));
  }
  const cat = tokens(category)[0];
  return cat ? [cat] : [];
}

function isRelevantResult(m, typeWords) {
  const text = `${m.pageTitle || ''} ${m.snippet || ''}`.toLowerCase();
  if (NON_PRODUCT_TITLE.test(m.pageTitle || '') && m.price === null) return false;
  if (typeWords.length && !typeWords.some((w) => text.includes(w))) return false; // different kind of product
  return true;
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

function debugResult(item, price) {
  if (!process.env.SEARCH_DEBUG) return;
  console.log(
    `[search] ${item.source} | ${(item.title || '').slice(0, 60)}\n` +
      `[search]   url: ${item.link}\n` +
      `[search]   rich_snippet: ${JSON.stringify(item.rich_snippet || null)}\n` +
      `[search]   snippet: ${(item.snippet || '').slice(0, 160)}\n` +
      `[search]   -> price=${price.price} orig=${price.originalPrice} range=${price.priceMin}-${price.priceMax} ${price.currency} ` +
      `variant=${price.variantDependent} src=${price.priceSource} conf=${price.priceConfidence}`
  );
}

function normalize(body, product, city) {
  const out = [];

  // Shopping results give the most reliable structured prices.
  for (const item of body.shopping_results || []) {
    const url = item.product_link || item.link;
    if (!isHttpUrl(url)) continue;
    const price = extractPrice(item);
    out.push({
      store: item.source || hostnameFromUrl(url),
      pageTitle: item.title || null,
      url,
      snippet: null,
      ...price,
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
    const price = extractPrice(item);
    debugResult(item, price);
    out.push({
      store: item.source || host,
      pageTitle: item.title || null,
      url: item.link,
      snippet: item.snippet || null,
      ...price,
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
 * @param {string[]} [params.characteristics] - short facts from the photo analysis (material, features)
 * @param {number} [params.deadlineMs] - stop starting new searches after this long
 */
async function searchProductWeb({ name, brand, category, confidence, city, country, characteristics = [], deadlineMs = 25000 }) {
  const product = { name, brand, category, confidence };
  const base = buildBaseQuery(product);
  if (!base) {
    return { isMock: false, provider: 'serpapi', query: null, matches: [], levels: [] };
  }

  // Add up to two short characteristic words (e.g. "mesh", "headrest") the
  // name doesn't already contain, so the query reflects what makes it this product.
  const baseTokens = new Set(tokens(base));
  const extra = [];
  for (const c of characteristics) {
    const word = tokens(c).find((t) => t.length > 3 && !baseTokens.has(t) && !extra.includes(t));
    if (word && extra.length < 2) extra.push(word);
  }
  const enriched = extra.length ? `${base} ${extra.join(' ')}`.slice(0, 100) : base;
  const typeWords = productTypeWords(name, category);
  const startedAt = Date.now();

  // Kosovo is the default market. A city from a different country is not
  // usable for the city step, and we never invent a country.
  const userCity = city && (!country || /kosov/i.test(country)) ? city : null;

  const seen = new Set();
  const pool = [];
  const levelLog = [];
  let searches = 0;
  let lastError = null;
  let reached = null;
  let stop = false;

  const count = (...localities) => pool.filter((m) => localities.includes(m.locality)).length;
  const enough = (levelId) => {
    if (levelId === 'city') return count('city') >= ENOUGH_RESULTS;
    if (levelId === 'country') return count('city', 'kosovo') >= ENOUGH_RESULTS;
    if (levelId === 'broad') return true;
    return count('city', 'kosovo', 'regional') >= ENOUGH_RESULTS;
  };

  for (const level of buildLevels(enriched, userCity, brand)) {
    if (stop) break;
    const entry = { level: level.id, queries: [], foundAtLevel: 0 };
    levelLog.push(entry);

    for (const step of level.queries) {
      if (searches >= MAX_SEARCHES || Date.now() - startedAt > deadlineMs) {
        console.warn('[webSearch] search budget reached; not widening further');
        stop = true;
        break;
      }
      let body;
      try {
        searches += 1;
        body = await callSerpApi(step.q, step.hl);
      } catch (err) {
        console.error(`[webSearch] "${level.id}" search failed:`, err.message);
        lastError = err;
        if (err.fatal) {
          stop = true;
          break;
        }
        continue;
      }
      entry.queries.push(step.q);
      reached = level.id; // a level counts as reached only once one of its searches actually ran

      for (const m of normalize(body, product, userCity)) {
        const key = m.url.replace(/[#?].*$/, '');
        if (seen.has(key)) continue;
        seen.add(key);
        // Only relevant products enter the pool, so counting them is meaningful.
        if (m.matchType === 'general' || !isRelevantResult(m, typeWords)) continue;
        pool.push({ ...m, searchScope: level.id });
        entry.foundAtLevel += 1;
      }
      if (enough(level.id)) {
        stop = true; // enough at this level: do not widen
        break;
      }
    }
  }

  if (pool.length === 0 && lastError) throw lastError;

  // Return only what belongs to the levels actually needed: results of a
  // wider level than the one we stopped at are never mixed in.
  const ALLOWED = {
    city: ['city'],
    country: ['city', 'kosovo'],
    albania: ['city', 'kosovo', 'regional'],
    'north-macedonia': ['city', 'kosovo', 'regional'],
    montenegro: ['city', 'kosovo', 'regional'],
    broad: ['city', 'kosovo', 'regional', 'unknown', 'international'],
  };
  const allowed = new Set(ALLOWED[reached] || ALLOWED.broad);
  const confident = pool.filter((m) => allowed.has(m.locality));
  // Results whose location can't be established are shown (as "unknown")
  // only while there are too few confidently located ones.
  const levelOrder = ['city', 'country', 'albania', 'north-macedonia', 'montenegro', 'broad'];
  const unknown =
    confident.length < ENOUGH_RESULTS && reached !== 'broad'
      ? pool
          .filter((m) => m.locality === 'unknown')
          .sort((a, b) => levelOrder.indexOf(a.searchScope) - levelOrder.indexOf(b.searchScope))
          .slice(0, ENOUGH_RESULTS - confident.length) // fill only up to the minimum, never flood
      : [];

  const localityRank = { city: 0, kosovo: 1, regional: 2, unknown: 3, international: 4 };
  const matchRank = { strong: 0, similar: 1, general: 2 };
  let final = [...confident, ...unknown].sort(
    (a, b) => localityRank[a.locality] - localityRank[b.locality] || matchRank[a.matchType] - matchRank[b.matchType]
  );
  if (reached === 'broad') final = final.slice(0, BROAD_CAP);

  console.log(
    `[webSearch] "${enriched}" city=${userCity || '-'} stopped at "${reached}" after ${searches} search(es) -> ${final.length} results [` +
      ['city', 'kosovo', 'regional', 'unknown', 'international'].map((l) => `${l}:${final.filter((m) => m.locality === l).length}`).join(' ') +
      ']'
  );

  return {
    isMock: false,
    provider: 'serpapi',
    query: enriched,
    matches: final.slice(0, MAX_RESULTS),
    levels: levelLog.filter((l) => l.queries.length > 0),
    stoppedAt: reached,
  };
}

module.exports = { isConfigured, searchProductWeb, buildBaseQuery, buildLevels, localityOf };
