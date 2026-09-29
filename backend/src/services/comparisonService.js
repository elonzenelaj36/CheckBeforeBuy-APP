/**
 * Deterministic price/value comparison for the Analyze flow.
 *
 * Takes the user's price (what they saw in the shop) and the alternatives
 * found through web search (what each result reports) and produces the
 * decision, reasoning and per-alternative notes. All arithmetic and every
 * verdict is computed here from structured evidence — the AI never does
 * the math, and nothing is stated that the search results don't support.
 *
 * Rules that matter:
 *  - Prices are compared only when both are in the same currency (no FX).
 *  - "Cheaper" is never treated as "better": each alternative's note also
 *    says whether its features are confirmed by the search result.
 *  - Too little evidence -> UNKNOWN, never a forced BUY/SKIP.
 */

const MAX_ALTERNATIVES = 5;
const MAX_PER_STORE = 2;
const MIN_COMPARABLE_FOR_VERDICT = 2;
const MIN_COMPARABLE_FOR_SKIP = 3;
const MEANINGFULLY_CHEAPER = 0.1; // 10%+ below the user's price
const CLEARLY_ABOVE = 1.15;
const FAR_ABOVE = 1.5;

const LOCALITY_LABEL = {
  city: 'Local',
  kosovo: 'Kosovo',
  regional: 'Regional',
  eu: 'EU',
  unknown: null,
  international: 'International',
};

// "Where is this shop?" for results the text search couldn't place (mostly image
// matches): an EU store (ikea.com/de/…, amazon.de) is nearer to Kosovo buyers than
// a US one (ikea.com/us/…, walmart.com) and is ranked and labelled accordingly.
const EU_TLDS = /\.(de|fr|it|es|nl|be|at|pt|ie|fi|gr|lu|mt|cy|sk|si|lt|lv|ee|hr|pl|cz|se|dk|hu|ro|bg|eu)$/i;
const EU_PATH = /^\/(de|fr|it|es|nl|be|at|pt|ie|fi|gr|sk|si|hr|pl|cz|se|dk|hu|ro|bg)(?:[-_][a-z]{2})?(\/|$)/i;
const EU_NAMES = /\b(germany|deutschland|italia|italy|france|españa|spain|österreich|austria|nederland|polska|hrvatska|slovenija|greece)\b/i;
const US_PATH = /^\/(us|en-us)(\/|$)/i;
const US_HOSTS = /(^|\.)(amazon\.com|walmart\.com|homedepot\.com|lowes\.com|wayfair\.com|target\.com|ebay\.com|craigslist\.org|offerup\.com|overstock\.com|bedbathandbeyond\.com|costco\.com|bestbuy\.com|ashleyfurniture\.com|ksl\.com)$/i;

function refineLocality(alt) {
  const base = alt.locality || 'unknown';
  if (base !== 'unknown' && base !== 'international') return base;
  let host = '';
  let pathname = '';
  try {
    const u = new URL(alt.url);
    host = u.hostname.replace(/^www\./, '');
    pathname = u.pathname;
  } catch {
    return base;
  }
  if (US_PATH.test(pathname) || US_HOSTS.test(host) || alt.currency === 'USD') return 'international';
  if (EU_TLDS.test(host) || EU_PATH.test(pathname) || EU_NAMES.test(alt.pageTitle || '')) return 'eu';
  return base;
}

const round2 = (n) => Math.round(n * 100) / 100;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatMoney(amount, currency) {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return currency === 'EUR' ? `€${value}` : `${value} ${currency}`;
}

/** Which of the photographed product's characteristics does this result's own text mention? */
function confirmedCharacteristics(characteristics, alt) {
  const text = `${alt.pageTitle || ''} ${alt.snippet || ''}`.toLowerCase();
  const usable = characteristics.filter((c) => c && c.trim().length > 2);
  const matched = usable.filter((c) => {
    const words = c.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    return words.length > 0 && words.every((w) => text.includes(w));
  });
  return { matched, total: usable.length };
}

function describeAlternative(rawAlt, userPrice, currency, characteristics) {
  const alt = { ...rawAlt, price: rawAlt.price ?? null, currency: rawAlt.currency ?? null };
  // Only an exact, same-currency price with at least medium confidence is comparable.
  const comparablePrice =
    alt.price !== null &&
    userPrice !== null &&
    alt.currency === currency &&
    (alt.priceConfidence === 'high' || alt.priceConfidence === 'medium');
  const features = confirmedCharacteristics(characteristics, alt);
  const locality = refineLocality(alt);
  // A price in another currency, converted with ECB reference rates: reference only, never "comparable".
  const converted = !comparablePrice && alt.price !== null && alt.convertedEur ? alt.convertedEur : null;

  const out = {
    title: alt.pageTitle,
    price: alt.price,
    originalPrice: alt.originalPrice ?? null,
    priceMin: alt.priceMin ?? null,
    priceMax: alt.priceMax ?? null,
    currency: alt.price !== null || alt.priceMin != null ? alt.currency : null,
    priceSource: alt.priceSource || null,
    priceConfidence: alt.priceConfidence || 'none',
    variantDependent: !!alt.variantDependent,
    priceComparisonAvailable: comparablePrice,
    url: alt.url,
    source: alt.store,
    imageMatch: !!alt.imageMatch,
    sourceType: 'online_store',
    sourcePlatform: 'web',
    locality,
    localityLabel: LOCALITY_LABEL[locality] ?? null,
    convertedPrice: converted ? { eur: converted.eur, rateDate: converted.date || null } : null,
    matchType: alt.matchType,
    priceDifference: null,
    priceDifferencePercent: null,
    confirmedFeatures: features.matched,
    category: 'other',
    reason: '',
  };

  const parts = [];
  if (alt.matchType === 'strong') parts.push(alt.imageMatch ? 'Same model (image match; color/size may differ)' : 'Possible exact match');
  else parts.push(alt.imageMatch ? 'Looks similar (image match)' : 'Similar product');

  if (comparablePrice) {
    const diff = round2(userPrice - alt.price);
    out.priceDifference = diff;
    out.priceDifferencePercent = round2((diff / userPrice) * 100);
    const cheaper = diff / userPrice >= MEANINGFULLY_CHEAPER;
    const featureSupport = features.total > 0 && features.matched.length / features.total >= 0.5;

    if (diff > 0) {
      parts.push(`${formatMoney(diff, currency)} lower listed price`);
      out.category = cheaper ? (featureSupport ? 'better_value' : 'better_price') : 'other';
      // (An image-matched same model is the product itself: no feature check needed.)
      if (cheaper && alt.matchType !== 'strong') {
        parts.push(
          featureSupport
            ? 'listing mentions similar features'
            : 'features not confirmed in the listing'
        );
      }
    } else if (diff < 0) {
      parts.push(`${formatMoney(-diff, currency)} higher listed price`);
    } else {
      parts.push('same listed price');
    }
  } else if (alt.price !== null && !alt.currency) {
    parts.push('price listed without a currency (not compared)');
  } else if (alt.price !== null && alt.currency !== currency && converted) {
    parts.push(`listed ${alt.price} ${alt.currency} ≈ ${formatMoney(converted.eur, currency)} (ECB rate; reference only, excludes shipping/import)`);
  } else if (alt.price !== null && alt.currency !== currency) {
    parts.push(`listed in ${alt.currency} (not compared with your ${currency} price)`);
  } else if (alt.price !== null) {
    parts.push(`listed price ${formatMoney(alt.price, alt.currency)}`);
  } else if (alt.priceMin != null) {
    parts.push(`listed from ${formatMoney(alt.priceMin, alt.currency)} to ${formatMoney(alt.priceMax, alt.currency)} (price range)`);
  } else if (alt.variantDependent) {
    parts.push('several prices listed (depends on size/variant, not compared)');
  } else {
    parts.push('price not listed');
  }

  if (alt.matchType === 'strong') out.category = 'same';
  out.reason = parts.join(' · ');
  return out;
}

const CATEGORY_ORDER = { same: 0, better_value: 1, better_price: 2, other: 3 };
const LOCALITY_ORDER = { city: 0, kosovo: 1, regional: 2, eu: 3, unknown: 4, international: 5 };
const ENOUGH_NEARER = 3; // this many non-international results hide the international ones

/**
 * Nearest first (Prizren → Kosovo → region → EU → rest), then same model before
 * similar, then cheaper. International (e.g. US) listings are shown only when
 * fewer than ENOUGH_NEARER nearer ones exist. `keep` (the listing the summary
 * talks about) is always shown.
 */
function pickAlternatives(described, keep = null) {
  const nearer = described.filter((a) => a.locality !== 'international').length;
  const pool = nearer >= ENOUGH_NEARER ? described.filter((a) => a.locality !== 'international' || a === keep) : described;
  const sorted = [...pool].sort(
    (a, b) =>
      LOCALITY_ORDER[a.locality] - LOCALITY_ORDER[b.locality] ||
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      (a.price ?? Infinity) - (b.price ?? Infinity)
  );
  // Keep the list short: at most MAX_PER_STORE listings per store (e.g. five IKEA colour variants).
  const perStore = new Map();
  const picked = [];
  const shownAs = new Set();
  for (const a of sorted) {
    const store = String(a.source || '').toLowerCase();
    // The same listing under two URLs (e.g. IKEA /de/en/ and /de/de/): show it once.
    const same = `${store}|${String(a.title || '').toLowerCase()}|${a.price ?? ''}`;
    if (shownAs.has(same) && a !== keep) continue;
    shownAs.add(same);
    if ((perStore.get(store) || 0) >= MAX_PER_STORE && a !== keep) continue;
    perStore.set(store, (perStore.get(store) || 0) + 1);
    picked.push(a);
  }
  const top = picked.slice(0, MAX_ALTERNATIVES);
  if (keep && !top.includes(keep)) top[top.length - 1] = keep;
  return top;
}

/**
 * @param {object} p
 * @param {number|null} p.userPrice
 * @param {string} [p.currency]
 * @param {string[]} [p.characteristics]
 * @param {Array} p.matches - normalized results from webSearchService
 * @param {'ok'|'unavailable'|'not_configured'|'skipped'} p.searchStatus
 * @param {number} [p.nearbyStoreCount] - physical stores found nearby (localDiscoveryService), only for wording
 */
function buildComparison({ userPrice, currency = 'EUR', characteristics = [], matches = [], searchStatus, nearbyStoreCount = 0 }) {
  const price = userPrice !== null && userPrice !== undefined && Number.isFinite(userPrice) && userPrice > 0 ? userPrice : null;
  const described = matches.map((m) => describeAlternative(m, price, currency, characteristics));

  const comparable = described.filter((a) => a.priceComparisonAvailable && a.matchType !== 'general');
  const comparablePrices = comparable.map((a) => a.price);
  const stats = comparablePrices.length
    ? {
        count: comparablePrices.length,
        min: Math.min(...comparablePrices),
        max: Math.max(...comparablePrices),
        median: round2(median(comparablePrices)),
      }
    : null;

  // Same model (image match / exact title) with a comparable listed price: the strongest price evidence.
  const exactComparable = described.filter((a) => a.priceComparisonAvailable && a.matchType === 'strong');
  const exactPrices = exactComparable.map((a) => a.price);
  const exactStats = exactPrices.length
    ? { count: exactPrices.length, min: Math.min(...exactPrices), max: Math.max(...exactPrices) }
    : null;
  const cheapestExact = exactComparable.length ? exactComparable.reduce((a, b) => (b.price < a.price ? b : a)) : null;

  // Weaker evidence, used only when there are not enough EUR prices:
  //   ranges    — "€80–€120" listings in EUR
  //   converted — prices in another currency, converted with ECB rates (reference only)
  const ranges = described.filter(
    (a) => a.matchType !== 'general' && a.price === null && a.priceMin != null && a.priceMax != null && a.currency === currency
  );
  const converted = described.filter((a) => a.matchType !== 'general' && a.convertedPrice);
  const convertedPrices = converted.map((a) => a.convertedPrice.eur);
  const evidence = {
    eurPrices: comparable.length,
    sameModelEurPrices: exactComparable.length,
    ranges: ranges.length,
    convertedReferences: converted.length,
    unpriced: described.filter((a) => a.price === null && a.priceMin == null).length,
    currencies: [...new Set(described.filter((a) => a.price !== null && a.currency && a.currency !== currency).map((a) => a.currency))],
  };

  const alternatives = pickAlternatives(described, cheapestExact);
  const exact = alternatives.find((a) => a.category === 'same') || null;
  let confidence = null; // 'high' | 'medium' | 'low' — how much evidence the verdict rests on

  const search ={ provider: 'serpapi', status: searchStatus, resultsFound: matches.length, pricedResults: comparablePrices.length };
  const reasoning = [];
  let decision = 'UNKNOWN';
  let title = 'Need more information';
  let summary;

  if (price === null) {
    reasoning.push('Price not provided, so no price-based judgment was made.');
    summary = alternatives.length
      ? 'The product was identified. Enter the price you saw to get a value comparison — similar products are listed below.'
      : 'The product was identified. Enter the price you saw to get a value comparison.';
  } else if (searchStatus !== 'ok') {
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(
      searchStatus === 'not_configured'
        ? 'Web search is not configured on this server, so no comparison was possible.'
        : "We couldn't search external products right now, so this is based only on the product information and your price."
    );
    summary = `The product was identified, but we couldn't compare ${formatMoney(price, currency)} with similar products.`;
  } else if (exactStats) {
    const diff = round2(price - cheapestExact.price);
    confidence = exactStats.count >= 2 ? 'high' : 'medium';
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(
      exactStats.count === 1
        ? `The same model is listed for ${formatMoney(cheapestExact.price, currency)} at ${cheapestExact.source}.`
        : `The same model is listed ${exactStats.count} times, from ${formatMoney(exactStats.min, currency)} to ${formatMoney(exactStats.max, currency)} (lowest at ${cheapestExact.source}).`
    );
    if (diff / price >= MEANINGFULLY_CHEAPER) {
      decision = 'COMPARE';
      title = 'Same model cheaper elsewhere';
      summary = `The same model is listed for ${formatMoney(cheapestExact.price, currency)} at ${cheapestExact.source} — ${formatMoney(diff, currency)} less than ${formatMoney(price, currency)}.`;
    } else {
      decision = 'BUY';
      title = diff <= 0 ? 'Good price' : 'Reasonable price';
      summary =
        diff <= 0
          ? `${formatMoney(price, currency)} is at or below the lowest listed price for this model (${formatMoney(cheapestExact.price, currency)}).`
          : `${formatMoney(price, currency)} is close to the lowest listed price for this model (${formatMoney(cheapestExact.price, currency)}).`;
    }
    reasoning.push('Listings can be a different color or size of the same model, and may be from another country (delivery not included) — check before deciding.');
  } else if (stats && stats.count === 1) {
    // Exactly one similar product with a reliable EUR price: a verdict, clearly marked as thin evidence.
    const only = comparable[0];
    confidence = 'low';
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(`One similar product with a reliable listed price was found: ${formatMoney(only.price, currency)} at ${only.source}.`);
    if (only.priceDifference / price >= MEANINGFULLY_CHEAPER) {
      decision = 'COMPARE';
      title = 'Consider alternatives';
      summary = `A similar product is listed ${formatMoney(only.priceDifference, currency)} cheaper than ${formatMoney(price, currency)} (based on 1 listing).`;
      reasoning.push(only.category === 'better_value' ? 'Its listing mentions features similar to your product.' : "Its listing doesn't confirm the same features, so it may not be equivalent.");
    } else {
      decision = 'BUY';
      title = only.priceDifference < 0 ? 'Looks like a good price' : 'Looks fair';
      summary =
        only.priceDifference < 0
          ? `${formatMoney(price, currency)} is below the one similar listing found (${formatMoney(only.price, currency)}).`
          : `${formatMoney(price, currency)} is in line with the one similar listing found (${formatMoney(only.price, currency)}).`;
    }
    reasoning.push('This is based on a single listing, so treat it as a rough guide.');
  } else if (!stats && ranges.length) {
    const lo = Math.min(...ranges.map((a) => a.priceMin));
    const hi = Math.max(...ranges.map((a) => a.priceMax));
    const span = `${formatMoney(lo, currency)}–${formatMoney(hi, currency)}`;
    confidence = 'low';
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(`${ranges.length} similar ${ranges.length === 1 ? 'listing gives' : 'listings give'} a price range of ${span} (depends on size/variant).`);
    if (price < lo) {
      decision = 'BUY';
      title = 'Looks like a good price';
      summary = `${formatMoney(price, currency)} is below the listed range for similar products (${span}).`;
    } else if (price <= hi) {
      decision = 'BUY';
      title = 'Looks fair';
      summary = `${formatMoney(price, currency)} is within the listed range for similar products (${span}).`;
    } else if (price >= hi * CLEARLY_ABOVE) {
      decision = 'COMPARE';
      title = 'Consider alternatives';
      summary = `${formatMoney(price, currency)} is above the listed range for similar products (${span}).`;
    } else {
      decision = 'BUY';
      title = 'Reasonable price';
      summary = `${formatMoney(price, currency)} is slightly above the listed range for similar products (${span}).`;
    }
    reasoning.push('Ranges cover several sizes or variants, so this is a rough guide.');
  } else if (!stats && convertedPrices.length) {
    const ref = round2(median(convertedPrices));
    const ratio = price / ref;
    confidence = 'low';
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(
      `${converted.length} similar ${converted.length === 1 ? 'listing is' : 'listings are'} priced in ${evidence.currencies.join('/')}; converted with European Central Bank reference rates that is about ${formatMoney(ref, currency)}${converted.length > 1 ? ' (median)' : ''}.`
    );
    if (ratio >= 1.3) {
      decision = 'COMPARE';
      title = 'Consider alternatives';
      summary = `${formatMoney(price, currency)} is well above the international reference price for similar products (about ${formatMoney(ref, currency)}).`;
    } else {
      decision = 'BUY';
      title = ratio <= 0.95 ? 'Looks like a good price' : 'Looks fair';
      summary = `${formatMoney(price, currency)} is ${ratio <= 0.95 ? 'below' : 'in line with'} the international reference price for similar products (about ${formatMoney(ref, currency)}).`;
    }
    reasoning.push('Reference prices are from abroad and exclude shipping and import costs, so this is only a rough guide.');
  } else if (!stats) {
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(
      matches.length
        ? `${matches.length} similar ${matches.length === 1 ? 'product was' : 'products were'} found, but none ${matches.length === 1 ? 'shows' : 'show'} a usable price${evidence.currencies.length ? ` (some are in ${evidence.currencies.join('/')} and couldn't be converted right now)` : ''}.`
        : 'No similar products with prices were found.'
    );
    summary = evidence.currencies.length
      ? `The prices we found are in ${evidence.currencies.join('/')} and couldn't be converted right now, so ${formatMoney(price, currency)} wasn't compared. You can still open the listings below.`
      : `We couldn't find any listed prices to compare ${formatMoney(price, currency)} with. You can still open the listings and stores below.`;
  } else {
    const ratio = price / stats.median;
    confidence = stats.count >= MIN_COMPARABLE_FOR_SKIP ? 'high' : 'medium';
    const cheaper = comparable.filter((a) => a.priceDifference / price >= MEANINGFULLY_CHEAPER);
    const cheaperWithFeatures = cheaper.filter((a) => a.category === 'better_value');

    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(
      `${stats.count} similar products with listed prices range from ${formatMoney(stats.min, currency)} to ${formatMoney(stats.max, currency)} (median ${formatMoney(stats.median, currency)}).`
    );

    if (ratio >= FAR_ABOVE && stats.count >= MIN_COMPARABLE_FOR_SKIP && cheaperWithFeatures.length > 0) {
      decision = 'SKIP';
      title = 'Consider skipping';
      summary = `${formatMoney(price, currency)} is well above what similar products are listed for.`;
    } else if (ratio >= CLEARLY_ABOVE) {
      // Includes "far above" cases whose features can't be confirmed: SKIP needs confirmed comparable features.
      decision = 'COMPARE';
      title = 'Consider alternatives';
      summary = `${formatMoney(price, currency)} looks high compared with similar listed products (median ${formatMoney(stats.median, currency)}).`;
    } else if (cheaper.length > 0) {
      decision = 'COMPARE';
      title = 'Consider alternatives';
      summary = `${formatMoney(price, currency)} is in the usual range, but ${cheaper.length} similar ${cheaper.length === 1 ? 'product is' : 'products are'} listed noticeably cheaper.`;
    } else {
      decision = 'BUY';
      title = ratio <= 0.95 ? 'Good deal' : 'Reasonable price';
      summary = `${formatMoney(price, currency)} is in line with or below similar listed products (median ${formatMoney(stats.median, currency)}).`;
    }

    if (cheaper.length) {
      const best = cheaper.reduce((a, b) => (b.priceDifference > a.priceDifference ? b : a));
      reasoning.push(`The largest saving found is ${formatMoney(best.priceDifference, currency)} (${best.priceDifferencePercent}%) on a similar product.`);
      reasoning.push(
        cheaperWithFeatures.length
          ? `${cheaperWithFeatures.length} of the cheaper ${cheaperWithFeatures.length === 1 ? 'options mentions' : 'options mention'} features similar to your product.`
          : "The cheaper options' listings don't confirm the same features, so they may not be equivalent."
      );
    }
    if (decision === 'BUY') reasoning.push('No similar product with a meaningfully lower listed price was found.');
    reasoning.push('Listed prices come from search results and may not be current.');
  }

  if (exact && !exactStats) reasoning.push('A possible exact match was found — see below.');
  const localCount = alternatives.filter((a) => a.locality === 'city' || a.locality === 'kosovo').length;
  if (alternatives.length && searchStatus === 'ok') {
    reasoning.push(
      localCount
        ? `${localCount} of the ${alternatives.length} results ${localCount === 1 ? 'is' : 'are'} from Kosovo/local sources.`
        : nearbyStoreCount
          ? `No online listing was clearly from Kosovo, but ${nearbyStoreCount} nearby ${nearbyStoreCount === 1 ? 'store was' : 'stores were'} found (see Nearby stores).`
          : 'No results were clearly identified as Kosovo/local sources.'
    );
  }
  if (searchStatus === 'ok' && matches.length === 0) {
    reasoning.push("No comparable products were found; we couldn't find reliable alternatives.");
  }

  // Cheapest comparable option, for the "your price / similar option / difference" summary.
  const cheapest = comparable.length ? comparable.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  // Prefer the same model over a merely similar product for the "your price vs …" summary.
  const shown = cheapestExact && cheapestExact.priceDifference > 0 ? cheapestExact : cheapest;
  const highlight =
    price !== null && shown && shown.priceDifference > 0
      ? {
          userPrice: price,
          similarPrice: shown.price,
          difference: shown.priceDifference,
          differencePercent: shown.priceDifferencePercent,
          currency,
          sameModel: shown === cheapestExact,
          source: shown.source,
        }
      : null;

  return {
    decision,
    title,
    summary,
    reasoning,
    highlight,
    confidence,
    evidence,
    priceComparisonAvailable: !!stats,
    userPrice: price,
    currency,
    priceStats: stats,
    exactPriceStats: exactStats,
    exactMatch: exact,
    alternatives,
    search,
  };
}

const LEGACY_RECOMMENDATION = { BUY: 'buy', COMPARE: 'consider', SKIP: 'skip', UNKNOWN: 'unknown' };

/** Maps the comparison onto the existing `recommendation`/`price_assessment` columns. */
function toLegacyFields(comparison) {
  const stats = comparison.exactPriceStats ? { median: comparison.exactPriceStats.min } : comparison.priceStats;
  let priceAssessment = 'unknown';
  if (comparison.userPrice !== null && stats) {
    const ratio = comparison.userPrice / stats.median;
    priceAssessment = ratio <= 0.95 ? 'good_deal' : ratio >= CLEARLY_ABOVE ? 'overpriced' : 'fair';
  }
  return { recommendation: LEGACY_RECOMMENDATION[comparison.decision] || 'unknown', priceAssessment };
}

module.exports = { buildComparison, toLegacyFields };
