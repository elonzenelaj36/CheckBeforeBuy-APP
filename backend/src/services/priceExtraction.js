/**
 * Price extraction from ONE SerpApi search result (no page fetching, no
 * scraping). Uses only what SerpApi already returned for that result and
 * says how reliable each price is:
 *
 *   structured  a real price field (shopping/immersive item `extracted_price`,
 *               rich_snippet `detected_extensions.price`)        -> 'high'
 *   text        an amount with an explicit currency marker in the result's
 *               title/snippet                                    -> 'medium'
 *   none        nothing reliable                                  -> 'none'
 *
 * Numbers without a currency marker (160x200, "2 year warranty", "5 reviews")
 * are never treated as prices. Ranges, sale/regular pairs and multi-variant
 * lists are represented explicitly instead of being collapsed to one number.
 * No currency conversion is done here.
 */

const SYMBOL_TO_CODE = { '€': 'EUR', $: 'USD', '£': 'GBP' };
const CODES = ['EUR', 'USD', 'GBP', 'CHF', 'MKD', 'ALL'];

/**
 * Normalizes European and US number formats:
 *   "1.299,99" -> 1299.99   "1,299.99" -> 1299.99   "399,99" -> 399.99
 *   "1.299" -> 1299         "1,299" -> 1299         "399.99" -> 399.99
 */
function parseAmount(raw) {
  const t = String(raw).replace(/[\s ]/g, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  let normalized = t;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (lastDot > -1 && /\.\d{3}$/.test(t)) {
    normalized = t.replace(/\./g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function currencyOf(marker) {
  if (!marker) return null;
  const m = marker.trim();
  if (SYMBOL_TO_CODE[m]) return SYMBOL_TO_CODE[m];
  const up = m.toUpperCase();
  return CODES.includes(up) ? up : null;
}

const AMOUNT = '(\\d{1,3}(?:[.,\\u00a0 ]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
const MARK = `(?:[€$£]|\\b(?:${CODES.join('|')})\\b)`;
// "€399", "EUR 399", "399 €", "399,99 EUR"
const PRICE_RE = new RegExp(`(${MARK})\\s?${AMOUNT}(?![\\d]|\\s?[x×]\\s?\\d)|${AMOUNT}\\s?(${MARK})`, 'gi');

/** All explicit-currency amounts in a text, in order, with their position. */
function findAmounts(text) {
  const out = [];
  if (!text) return out;
  for (const m of text.matchAll(PRICE_RE)) {
    const marker = m[1] || m[4];
    const rawAmount = m[2] || m[3];
    // "ALL" is also an English word: only accept the exact uppercase code, after the amount ("12000 ALL").
    if (/^all$/i.test(marker) && !(marker === 'ALL' && m[4])) continue;
    const currency = currencyOf(marker);
    const value = parseAmount(rawAmount);
    if (currency && value !== null) out.push({ value, currency, index: m.index, end: m.index + m[0].length });
  }
  return out;
}

const OLD_PRICE_HINT = /(regular|was|originally|before|instead of|para|m[eë] par[eë]|[cç]mimi i vjet[eë]r|old|list)(\s+(price|çmimi|cmimi))?\W{0,12}$/i;
const RANGE_JOINER = /^\s*(?:-|–|—|to|deri)\s*$/i;

const NONE = () => ({
  price: null,
  originalPrice: null,
  priceMin: null,
  priceMax: null,
  currency: null,
  variantDependent: false,
  priceSource: null,
  priceConfidence: 'none',
});

/** Structured price fields SerpApi attaches to shopping/immersive items. */
function fromStructuredItem(item) {
  const value = Number(item.extracted_price);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cur = findAmounts(item.price)[0]?.currency || null; // currency only if the display string states it
  const orig = Number(item.extracted_original_price);
  return {
    ...NONE(),
    price: value,
    originalPrice: Number.isFinite(orig) && orig > value ? orig : null,
    currency: cur,
    priceSource: 'structured',
    priceConfidence: 'high',
  };
}

/** rich_snippet.{top,bottom}.detected_extensions.price / extensions text. */
function fromRichSnippet(item) {
  for (const part of [item.rich_snippet?.bottom, item.rich_snippet?.top]) {
    if (!part) continue;
    const extText = (part.extensions || []).join(' | ');
    const amounts = findAmounts(extText);
    const detected = part.detected_extensions?.price;

    // "$899 to $2,290" style ranges are exposed only as text in `extensions`.
    if (amounts.length === 2 && RANGE_JOINER.test(extText.slice(amounts[0].end, amounts[1].index)) && amounts[0].currency === amounts[1].currency) {
      const [lo, hi] = [amounts[0].value, amounts[1].value].sort((a, b) => a - b);
      return { ...NONE(), priceMin: lo, priceMax: hi, currency: amounts[0].currency, priceSource: 'structured', priceConfidence: 'high' };
    }
    if (detected != null && Number.isFinite(Number(detected)) && Number(detected) > 0) {
      // detected_extensions.currency is sometimes garbage ("$ to $"): trust only a clean symbol/code.
      const cur = currencyOf(part.detected_extensions.currency) || amounts[0]?.currency || null;
      return { ...NONE(), price: Number(detected), currency: cur, priceSource: 'structured', priceConfidence: 'high' };
    }
  }
  return null;
}

/** Explicit-currency amounts in title/snippet. */
function fromText(text) {
  const amounts = findAmounts(text);
  if (amounts.length === 0) return null;

  const currencies = new Set(amounts.map((a) => a.currency));
  if (currencies.size > 1) return { ...NONE(), variantDependent: true, priceSource: 'text', priceConfidence: 'none' };
  const currency = amounts[0].currency;
  const distinct = [...new Set(amounts.map((a) => a.value))];

  if (distinct.length === 1) {
    return { ...NONE(), price: distinct[0], currency, priceSource: 'text', priceConfidence: 'medium' };
  }

  // "€399 – €599" -> range, never a single exact price
  if (amounts.length === 2 && RANGE_JOINER.test(text.slice(amounts[0].end, amounts[1].index))) {
    const [lo, hi] = [amounts[0].value, amounts[1].value].sort((a, b) => a - b);
    return { ...NONE(), priceMin: lo, priceMax: hi, currency, priceSource: 'text', priceConfidence: 'medium' };
  }

  // "Regular price €499, sale price €399" -> current price + original
  if (distinct.length === 2) {
    const oldOne = amounts.find((a) => OLD_PRICE_HINT.test(text.slice(Math.max(0, a.index - 20), a.index)));
    if (oldOne) {
      const current = amounts.find((a) => a.value !== oldOne.value);
      if (current && current.value < oldOne.value) {
        return { ...NONE(), price: current.value, originalPrice: oldOne.value, currency, priceSource: 'text', priceConfidence: 'medium' };
      }
    }
  }

  // Several unrelated prices (sizes/variants/multiple ads): no single price can be tied to this result.
  return { ...NONE(), variantDependent: true, currency, priceSource: 'text', priceConfidence: 'none' };
}

/**
 * @param {object} item - one SerpApi organic/shopping/immersive result
 * @returns normalized price info (see NONE())
 */
function extractPrice(item) {
  const fromTitleOrSnippet = fromText(`${item.title || ''} ${item.snippet || ''}`);
  // Classified-ad sites often put the price in the listing's own URL slug
  // ("...-Comodita-450%E2%82%AC-5067676"). It's part of the result SerpApi gave us,
  // so it's usable when nothing better exists — but never overrides a clear text price.
  const usable = (r) => r && (r.price !== null || r.priceMin !== null);
  return (
    fromStructuredItem(item) ||
    fromRichSnippet(item) ||
    (usable(fromTitleOrSnippet) ? fromTitleOrSnippet : null) ||
    fromUrl(item.link || item.product_link) ||
    fromTitleOrSnippet ||
    NONE()
  );
}

function fromUrl(url) {
  if (!url) return null;
  let slug;
  try {
    slug = decodeURIComponent(new URL(url).pathname).replace(/[-_/]+/g, ' ');
  } catch {
    return null;
  }
  const r = fromText(slug);
  return r && r.price !== null ? { ...r, priceSource: 'url' } : null;
}

module.exports = { extractPrice, parseAmount, findAmounts };
