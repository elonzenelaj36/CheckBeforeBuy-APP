/**
 * Currency conversion to EUR for REFERENCE prices only.
 *
 * Source: the European Central Bank's euro foreign exchange reference rates
 * (https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml) — free, no
 * key. The ECB allows reuse provided it is cited as the source, and publishes
 * them "for information purposes only", which is exactly how they are used
 * here: a converted listing price is labelled as an approximate reference and
 * never decides a verdict on its own (see comparisonService.js).
 *
 * Rates are cached in memory for 12 hours (the ECB updates once per working
 * day, ~16:00 CET). If the ECB can't be reached, conversion is simply
 * unavailable (callers treat the price as not comparable, as before).
 */

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const TTL_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

let cache = null; // { rates: {USD: 1.13, ...} (units per 1 EUR), date: '2026-09-29', fetchedAt: ms }
let inflight = null;

function parseEcbXml(xml) {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1] || null;
  const rates = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g)) {
    const r = Number(m[2]);
    if (r > 0) rates[m[1]] = r;
  }
  return { date, rates };
}

async function loadRates() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch(ECB_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseEcbXml(await res.text());
        if (!Object.keys(parsed.rates).length) throw new Error('no rates in response');
        cache = { ...parsed, fetchedAt: Date.now() };
      } catch (err) {
        console.warn('[fx] ECB rates unavailable:', err.message);
        // keep a stale cache if there is one
      } finally {
        inflight = null;
      }
      return cache;
    })();
  }
  return inflight;
}

/**
 * @returns {Promise<null | {eur: number, rate: number, date: string|null}>} amount in EUR, or null when unknown
 */
async function toEur(amount, currency) {
  if (!Number.isFinite(amount) || !currency) return null;
  if (currency === 'EUR') return { eur: amount, rate: 1, date: null };
  const data = await loadRates();
  const rate = data?.rates?.[currency];
  if (!rate) return null;
  return { eur: Math.round((amount / rate) * 100) / 100, rate, date: data.date };
}

module.exports = { toEur, loadRates, parseEcbXml };
