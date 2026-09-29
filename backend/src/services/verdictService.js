/**
 * The combined verdict at the top of Analyze Product: one short paragraph that
 * joins the price comparison, the room fit and what the product is ("This
 * chair at €14 is worth considering: no chair was detected in your bedroom,
 * its dark wood matches your bed, and €14 is below similar listings nearby").
 *
 * The facts are computed elsewhere (comparisonService does every number,
 * roomContextService/the analysis supply the room fit); this only WRITES.
 * One text-only Groq call (no image, a few hundred tokens), then a guard:
 *   - every number in the text must appear in the facts, and
 *   - the text may not contradict the computed decision,
 * otherwise a plain sentence built from the same facts is used instead. A
 * failure here never fails the analysis.
 */

const env = require('../config/env');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 20000;

const DECISION_WORDS = {
  BUY: 'worth buying at this price',
  COMPARE: 'worth comparing before buying',
  SKIP: 'probably worth skipping at this price',
  UNKNOWN: 'not possible to judge on price yet',
};

const PROMPT = `You write the one-paragraph verdict of a shopping-assistant app, in plain English, speaking to the user ("you").
Use ONLY the facts in the JSON below. Rules:
- 2 to 4 sentences, at most 90 words. No lists, no markdown.
- Start with the product and its price if a userPrice is given.
- The overall recommendation MUST match "decision" (${Object.entries(DECISION_WORDS).map(([k, v]) => `${k} = ${v}`).join('; ')}).
- Mention the room only if "room" is present: use its fit summary (duplicate / replacement / complement / fills a gap, and color/material match if stated). About the room's existing items say "was not detected in your room", never "you don't have one". Never say the product itself was "not detected".
- If decision is UNKNOWN, say plainly that the price can't be judged yet and why.
- Mention prices only as given (same-model listings, similar listings, nearby stores). Never invent or round a number, never convert currency.
- If a same-model listing is cheaper, say where. If nothing reliable was found, say so honestly.
- If "confidence" is "low", say briefly that it is a rough guide and why (e.g. based on one listing, on price ranges, or on foreign prices converted to euros).
Return JSON only: {"title": "3-6 word headline", "text": "the paragraph"}`;

/** Every number that appears anywhere in the facts (as written, and with decimals trimmed). */
function factNumbers(facts) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.add(String(v));
      out.add(String(Math.round(v * 100) / 100));
    } else if (typeof v === 'string') {
      for (const m of v.match(/\d+(?:[.,]\d+)?/g) || []) out.add(m.replace(',', '.'));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}

/** True when every number in `text` is one of the facts' numbers. */
function numbersSupported(text, facts) {
  const allowed = factNumbers(facts);
  const used = (String(text).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));
  return used.every((n) => allowed.has(n) || allowed.has(String(Number(n))));
}

// Assertive claims only ("is a good deal"), so "we can't tell whether it is a good deal" passes.
const NOT_ASSERTED = "(?<!\\b(?:whether|if|know|sure|judge)\\b[^.]{0,40})";
const CLAIM_GOOD = new RegExp(`${NOT_ASSERTED}\\b(is|looks like|it's|that's) (a |an )?(really |very )?(good|great|excellent) (deal|price|buy)\\b`, 'i');
const CLAIM_BAD = new RegExp(`${NOT_ASSERTED}\\b(is|looks|it's) (clearly |very |way )?(overpriced|too expensive)\\b`, 'i');
const CONTRADICTIONS = {
  BUY: new RegExp(`${CLAIM_BAD.source}|\\b(you should skip|don'?t buy|do not buy)\\b`, 'i'),
  SKIP: new RegExp(`${CLAIM_GOOD.source}|\\bgo for it\\b`, 'i'),
  UNKNOWN: new RegExp(`${CLAIM_GOOD.source}|${CLAIM_BAD.source}`, 'i'),
  COMPARE: /\b(you should skip|don'?t buy|do not buy)\b/i,
};

function money(amount, currency) {
  if (amount === null || amount === undefined) return null;
  const v = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return !currency || currency === 'EUR' ? `€${v}` : `${v} ${currency}`;
}

/**
 * The facts the paragraph may use — small and explicit.
 * @param {object} p
 * @param {{name:string, category:string|null, brand:string|null}} p.product
 * @param {string[]} p.characteristics
 * @param {string|null} p.identifiedAs - what visual search recognised (e.g. "IKEA POÄNG armchair")
 * @param {object} p.comparison - buildComparison() output (+ localStores/socialProfiles)
 * @param {object|null} p.roomContext - { room, items, fit }
 */
function buildFacts({ product, characteristics = [], identifiedAs = null, comparison, roomContext = null }) {
  const c = comparison;
  const cheapestSimilar = c.priceStats ? { min: c.priceStats.min, max: c.priceStats.max, median: c.priceStats.median, count: c.priceStats.count } : null;
  const exact = c.exactPriceStats
    ? {
        count: c.exactPriceStats.count,
        lowest: c.exactPriceStats.min,
        highest: c.exactPriceStats.max,
        lowestAt: c.alternatives.find((a) => a.matchType === 'strong' && a.price === c.exactPriceStats.min)?.source || null,
      }
    : null;
  const facts = {
    product: {
      // What image search recognised is more specific than the AI's generic name.
      name: identifiedAs || product.name,
      category: product.category || null,
      brand: product.brand || null,
      identifiedAs,
      looks: characteristics.slice(0, 5),
    },
    userPrice: c.userPrice,
    currency: c.currency,
    decision: c.decision,
    // high/medium/low: how much price evidence there is (low = one listing, price ranges or converted foreign prices).
    confidence: c.confidence ?? null,
    priceSummary: c.summary,
    priceReasoning: (c.reasoning || []).slice(0, 4),
    // Computed "your price vs the cheapest comparable listing" (difference already worked out).
    priceGap: c.highlight
      ? { cheaperListing: c.highlight.similarPrice, youWouldSave: c.highlight.difference, percent: c.highlight.differencePercent, sameModel: !!c.highlight.sameModel, at: c.highlight.source || null }
      : null,
    sameModelListings: exact,
    similarListings: cheapestSimilar,
    nearbyStores: (c.localStores || []).length ? { count: c.localStores.length, names: c.localStores.slice(0, 3).map((s) => s.title) } : null,
    socialPosts: (c.socialProfiles || []).length || null,
  };
  if (roomContext) {
    facts.room = {
      name: roomContext.room.name,
      type: roomContext.room.roomType,
      fit: roomContext.fit ? { relation: roomContext.fit.relation, summary: roomContext.fit.summary } : null,
    };
  }
  return facts;
}

/** Plain verdict from the same facts (used when the AI text is missing or rejected). */
function firstSentence(text) {
  const m = /^.*?[.!?](\s|$)/.exec(String(text || '').trim());
  return (m ? m[0] : String(text || '')).trim();
}

function templateVerdict(facts) {
  const name = facts.product.name || 'This product';
  const parts = [];
  if (facts.userPrice !== null) parts.push(`${name} at ${money(facts.userPrice, facts.currency)}: ${firstSentence(facts.priceSummary)}`);
  else parts.push(`${name}: ${firstSentence(facts.priceSummary)}`);
  if (facts.room?.fit?.summary) parts.push(firstSentence(facts.room.fit.summary));
  if (facts.nearbyStores) parts.push(`${facts.nearbyStores.count} nearby ${facts.nearbyStores.count === 1 ? 'store' : 'stores'} may sell this kind of product.`);
  const titles = { BUY: 'Worth buying', COMPARE: 'Compare before buying', SKIP: 'Consider skipping', UNKNOWN: 'Need more information' };
  return { title: titles[facts.decision] || titles.UNKNOWN, text: parts.join(' ') };
}

async function callGroq(facts) {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ai.apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: env.ai.model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 400,
      messages: [{ role: 'user', content: `${PROMPT}\n\nFACTS:\n${JSON.stringify(facts)}` }],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

/**
 * @returns {Promise<{title: string, text: string, decision: string, source: 'ai'|'template'}>}
 */
async function writeVerdict(input) {
  const facts = buildFacts(input);
  const fallback = { ...templateVerdict(facts), decision: facts.decision, source: 'template' };
  if (env.ai.provider !== 'groq' || !env.ai.apiKey) return fallback;

  try {
    const out = await callGroq(facts);
    const title = typeof out.title === 'string' ? out.title.trim().slice(0, 60) : '';
    const text = typeof out.text === 'string' ? out.text.trim().slice(0, 700) : '';
    if (!title || !text) return fallback;
    if (!numbersSupported(`${title} ${text}`, facts)) {
      console.warn('[verdict] rejected AI text: it used a number that is not in the facts');
      return fallback;
    }
    if (CONTRADICTIONS[facts.decision]?.test(`${title} ${text}`)) {
      console.warn(`[verdict] rejected AI text: contradicts decision ${facts.decision}`);
      return fallback;
    }
    return { title, text, decision: facts.decision, source: 'ai' };
  } catch (err) {
    console.warn('[verdict] AI verdict failed, using template:', err.message);
    return fallback;
  }
}

module.exports = { writeVerdict, CONTRADICTIONS, buildFacts, templateVerdict, numbersSupported, factNumbers };
