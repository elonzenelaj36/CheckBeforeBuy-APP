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
const MIN_COMPARABLE_FOR_VERDICT = 2;
const MIN_COMPARABLE_FOR_SKIP = 3;
const MEANINGFULLY_CHEAPER = 0.1; // 10%+ below the user's price
const CLEARLY_ABOVE = 1.15;
const FAR_ABOVE = 1.5;

const LOCALITY_LABEL = {
  city: 'Local',
  kosovo: 'Kosovo',
  regional: 'Regional',
  unknown: null,
  international: 'International',
};

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
    locality: alt.locality,
    localityLabel: LOCALITY_LABEL[alt.locality] ?? null,
    matchType: alt.matchType,
    priceDifference: null,
    priceDifferencePercent: null,
    confirmedFeatures: features.matched,
    category: 'other',
    reason: '',
  };

  const parts = [];
  if (alt.matchType === 'strong') parts.push('Possible exact match');
  else parts.push('Similar product');

  if (comparablePrice) {
    const diff = round2(userPrice - alt.price);
    out.priceDifference = diff;
    out.priceDifferencePercent = round2((diff / userPrice) * 100);
    const cheaper = diff / userPrice >= MEANINGFULLY_CHEAPER;
    const featureSupport = features.total > 0 && features.matched.length / features.total >= 0.5;

    if (diff > 0) {
      parts.push(`${formatMoney(diff, currency)} lower listed price`);
      out.category = cheaper ? (featureSupport ? 'better_value' : 'better_price') : 'other';
      if (cheaper) {
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
  } else if (alt.price !== null && alt.currency !== currency) {
    parts.push(`listed in ${alt.currency} (not compared with your ${currency} price)`);
  } else if (alt.price !== null) {
    parts.push(`listed price ${formatMoney(alt.price, alt.currency)}`);
  } else if (alt.priceMin != null) {
    parts.push(`listed from ${formatMoney(alt.priceMin, alt.currency)} to ${formatMoney(alt.priceMax, alt.currency)} (range, not compared)`);
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
const LOCALITY_ORDER = { city: 0, kosovo: 1, regional: 2, unknown: 3, international: 4 };

function pickAlternatives(described) {
  const sorted = [...described].sort(
    (a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      LOCALITY_ORDER[a.locality] - LOCALITY_ORDER[b.locality] ||
      (a.price ?? Infinity) - (b.price ?? Infinity)
  );
  // Keep the list short; make sure a well-matched local option isn't crowded out.
  return sorted.slice(0, MAX_ALTERNATIVES);
}

/**
 * @param {object} p
 * @param {number|null} p.userPrice
 * @param {string} [p.currency]
 * @param {string[]} [p.characteristics]
 * @param {Array} p.matches - normalized results from webSearchService
 * @param {'ok'|'unavailable'|'not_configured'|'skipped'} p.searchStatus
 */
function buildComparison({ userPrice, currency = 'EUR', characteristics = [], matches = [], searchStatus }) {
  const price = userPrice !== null && userPrice !== undefined && Number.isFinite(userPrice) && userPrice > 0 ? userPrice : null;
  const described = matches.map((m) => describeAlternative(m, price, currency, characteristics));
  const alternatives = pickAlternatives(described);
  const exact = alternatives.find((a) => a.category === 'same') || null;

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

  const search = { provider: 'serpapi', status: searchStatus, resultsFound: matches.length, pricedResults: comparablePrices.length };
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
  } else if (stats && stats.count === 1 && comparable[0].priceDifference / price >= MEANINGFULLY_CHEAPER) {
    // A single reliable price isn't enough for a value verdict, but a clearly cheaper similar product is still worth comparing.
    const only = comparable[0];
    decision = 'COMPARE';
    title = 'Consider alternatives';
    summary = `A similar product is listed ${formatMoney(only.priceDifference, currency)} cheaper than ${formatMoney(price, currency)}.`;
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(`Only one similar product with a reliable listed price was found (${formatMoney(only.price, currency)}), so this is not a full market comparison.`);
    reasoning.push(only.category === 'better_value' ? 'Its listing mentions features similar to your product.' : "Its listing doesn't confirm the same features, so it may not be equivalent.");
  } else if (!stats || stats.count < MIN_COMPARABLE_FOR_VERDICT) {
    reasoning.push(`The price you entered is ${formatMoney(price, currency)}.`);
    reasoning.push(
      stats
        ? `Only ${stats.count} similar product with a listed price in ${currency} was found — not enough to judge.`
        : `None of the ${matches.length} similar products found list a reliable price in ${currency}.`
    );
    summary = `The product was identified, but we couldn't find enough reliable pricing information to judge whether ${formatMoney(price, currency)} is a good deal. You can still explore similar products below.`;
  } else {
    const ratio = price / stats.median;
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

  if (exact) reasoning.push('A possible exact match was found — see below.');
  const localCount = alternatives.filter((a) => a.locality === 'city' || a.locality === 'kosovo').length;
  if (alternatives.length && searchStatus === 'ok') {
    reasoning.push(localCount ? `${localCount} of the ${alternatives.length} results ${localCount === 1 ? 'is' : 'are'} from Kosovo/local sources.` : 'No results were clearly identified as Kosovo/local sources.');
  }
  if (searchStatus === 'ok' && matches.length === 0) {
    reasoning.push("No comparable products were found; we couldn't find reliable alternatives.");
  }

  // Cheapest comparable option, for the "your price / similar option / difference" summary.
  const cheapest = comparable.length ? comparable.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  const highlight =
    price !== null && cheapest && cheapest.priceDifference > 0
      ? { userPrice: price, similarPrice: cheapest.price, difference: cheapest.priceDifference, differencePercent: cheapest.priceDifferencePercent, currency }
      : null;

  return {
    decision,
    title,
    summary,
    reasoning,
    highlight,
    priceComparisonAvailable: !!stats,
    userPrice: price,
    currency,
    priceStats: stats,
    exactMatch: exact,
    alternatives,
    search,
  };
}

const LEGACY_RECOMMENDATION = { BUY: 'buy', COMPARE: 'consider', SKIP: 'skip', UNKNOWN: 'unknown' };

/** Maps the comparison onto the existing `recommendation`/`price_assessment` columns. */
function toLegacyFields(comparison) {
  const stats = comparison.priceStats;
  let priceAssessment = 'unknown';
  if (comparison.userPrice !== null && stats) {
    const ratio = comparison.userPrice / stats.median;
    priceAssessment = ratio <= 0.95 ? 'good_deal' : ratio >= CLEARLY_ABOVE ? 'overpriced' : 'fair';
  }
  return { recommendation: LEGACY_RECOMMENDATION[comparison.decision] || 'unknown', priceAssessment };
}

module.exports = { buildComparison, toLegacyFields };
