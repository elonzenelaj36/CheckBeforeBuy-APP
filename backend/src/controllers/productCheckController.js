const { pool } = require('../db/connection');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { optionalNumber, requireString } = require('../utils/validate');
const { relativeUploadPath, uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { analyzeProductImage } = require('../services/aiService');
const webSearch = require('../services/webSearchService');
const { buildComparison, toLegacyFields } = require('../services/comparisonService');
const localDiscovery = require('../services/localDiscoveryService');
const visualSearch = require('../services/visualSearchService');
const { writeVerdict } = require('../services/verdictService');
const { toEur } = require('../services/fxService');
const { buildRoomContext, parseRoomFit } = require('../services/roomContextService');
const { getApproximateLocationFromIp, getClientIp } = require('../services/locationService');
const path = require('path');

function serializeCheck(row) {
  return {
    id: String(row.id),
    product: {
      id: row.product_id ? String(row.product_id) : null,
      name: row.detected_name,
      category: row.detected_category,
      brand: row.detected_brand,
    },
    analysis: {
      description: row.description,
      estimatedPrice:
        row.estimated_price !== null && row.estimated_price !== undefined ? Number(row.estimated_price) : null,
      estimatedPriceMin: row.estimated_price_min !== null ? Number(row.estimated_price_min) : null,
      estimatedPriceMax: row.estimated_price_max !== null ? Number(row.estimated_price_max) : null,
      currency: row.currency,
      userPrice: row.user_price !== null ? Number(row.user_price) : null,
      priceAssessment: row.price_assessment,
      recommendation: row.recommendation,
      confidence: row.confidence !== null ? Number(row.confidence) : null,
      isMock: !!row.is_mock,
    },
    imageUrl: toAbsoluteUrl(row.image_path),
    hasVisualization: !!row.has_visualization,
    createdAt: row.created_at,
  };
}

/**
 * POST /api/product-checks
 * multipart/form-data: image (required), userPrice, productName, roomId, city, country (all optional)
 *
 * roomId: the room the product is for. Its already-detected items (Items
 * Detected) are given to the analysis as evidence; an unknown/foreign room is
 * ignored (the analysis then runs exactly as without one).
 *
 * Flow: save uploaded photo -> call AI service -> upsert a `products` row
 * -> insert a `product_checks` row -> (if a price was estimated) record it
 * in `price_history` -> return the structured analysis.
 */
const createProductCheck = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'An "image" file is required.');
  }

  const userPrice = optionalNumber(req.body.userPrice);
  const userProductName = req.body.productName?.trim() || null;
  const relativeImagePath = relativeUploadPath(req.file);
  const absoluteImagePath = path.join(uploadRoot, path.basename(req.file.path));

  const [ownedItems] = await pool.query(
    'SELECT name, category FROM user_items WHERE user_id = ? LIMIT 50',
    [req.user.id]
  );

  // Room context never blocks the analysis: on any problem it is just left out.
  let roomContext = null;
  if (req.body.roomId) {
    try {
      roomContext = await buildRoomContext(req.user.id, req.body.roomId);
    } catch (err) {
      console.error('[product-checks] room context failed:', err.message);
    }
  }

  // Coarse city only: one the client sent, else best-effort IP lookup
  // (null on private/dev IPs). Never stored; only a word in search queries.
  let city = req.body.city ? String(req.body.city).trim().slice(0, 60) : null;
  let country = req.body.country ? String(req.body.country).trim().slice(0, 60) : null;
  if (!city) {
    const geo = await getApproximateLocationFromIp(getClientIp(req)).catch(() => null);
    city = geo?.city || null;
    country = geo?.country || country;
  }
  // Kosovo is the default market; a city abroad is not used (same rule as the online search).
  const localCity = city && (!country || /kosov/i.test(country)) ? city : null;

  // Visual search (Google Lens) needs only the photo, so it runs while the AI
  // analyses it. It never throws (failures come back as a status).
  // (Skipped when the AI isn't configured: the analysis is then a mock and its results are never searched.)
  const lensPromise = webSearch.isConfigured() && env.ai.apiKey
    ? visualSearch.searchByImage(absoluteImagePath, { city: localCity }).catch((err) => {
        console.error('[product-checks] visual search failed:', err.message);
        return { status: 'unavailable', identity: null, matches: [], social: [] };
      })
    : null;

  let aiResult;
  try {
    aiResult = await analyzeProductImage({
      absoluteImagePath,
      userPrice,
      userItems: ownedItems,
      roomContext: roomContext?.promptText,
    });
  } catch (err) {
    throw new ApiError(502, "We couldn't analyze this product. Please try again.", err.message);
  }

  const { product, analysis, isMock, provider, model } = aiResult;
  // A model recognised by image search ("IKEA POÄNG armchair") names the product
  // better than the AI's generic guess; a name the user typed always wins.
  const lensResult = lensPromise && !isMock ? await lensPromise : null;
  const finalProductName = userProductName || lensResult?.identity || product.name;

  // ── Web search + price-aware comparison ────────────────────────────────
  // Groq output is used as-is. A search failure never fails the analysis:
  // the comparison just reports that no external search was possible.
  const characteristics = Array.isArray(aiResult.raw?.visibleSpecifications) ? aiResult.raw.visibleSpecifications : [];
  let matches = [];
  let searchStatus = 'skipped';
  // Nearby stores and social profiles: separate searches that fail on their own.
  let local = { status: 'skipped', stores: [] };
  let social = { status: 'skipped', profiles: [] };
  let lens = { status: 'skipped', identity: null, matches: [], social: [] };
  let shopStatus = 'skipped';
  if (!isMock) {
    if (!webSearch.isConfigured()) {
      searchStatus = 'not_configured';
      local.status = 'not_configured';
      social.status = 'not_configured';
      lens.status = 'not_configured';
      shopStatus = 'not_configured';
    } else {
      lens = lensResult || lens;
      // When Lens recognised a specific model (e.g. "IKEA POÄNG armchair") the
      // text searches look for THAT, unless the user named the product themselves.
      const searchName = !userProductName && lens.identity ? lens.identity : finalProductName;
      const discovery = { name: searchName, category: product.category, city: localCity };

      const [online, shops, stores, profiles] = await Promise.allSettled([
        webSearch.searchProductWeb({
          name: searchName,
          brand: product.brand,
          category: product.category,
          confidence: analysis.confidence,
          city,
          country,
          characteristics,
        }),
        // Kosovo online shops (GjirafaMall, Foleja, MerrJep…) searched directly for this model / product type.
        webSearch.searchKosovoShops({
          name: searchName,
          identity: lens.identity,
          brand: product.brand,
          category: product.category,
          confidence: analysis.confidence,
          city: localCity,
        }),
        localDiscovery.searchLocalStores(discovery),
        localDiscovery.searchSocialProfiles(discovery),
      ]);
      const textMatches = online.status === 'fulfilled' ? online.value.matches : [];
      if (online.status === 'rejected') console.error('[product-checks] alternative search failed:', online.reason?.message);
      const shopMatches = shops.status === 'fulfilled' ? shops.value.matches : [];
      shopStatus = shops.status === 'fulfilled' ? shops.value.status : 'unavailable';
      // Kosovo shops and image matches first, then text results; one entry per page.
      const seenUrls = new Set();
      matches = [...shopMatches, ...lens.matches, ...textMatches].filter((m) => {
        const key = m.url.replace(/[#?].*$/, '');
        if (seenUrls.has(key)) return false;
        seenUrls.add(key);
        return true;
      });
      // Prices in other currencies get an approximate EUR value (ECB reference rates) — reference only.
      await Promise.all(
        matches
          .filter((m) => m.price !== null && m.price !== undefined && m.currency && m.currency !== 'EUR')
          .map(async (m) => {
            m.convertedEur = await toEur(m.price, m.currency).catch(() => null);
          })
      );
      searchStatus = online.status === 'fulfilled' || lens.status === 'ok' || shopStatus === 'ok' ? 'ok' : 'unavailable';

      local = stores.status === 'fulfilled' ? stores.value : { status: 'unavailable', stores: [] };
      social = profiles.status === 'fulfilled' ? profiles.value : { status: 'unavailable', profiles: [] };
      // Posts that show the same-looking product (image match) lead the social group.
      const seenSocial = new Set();
      social = {
        ...social,
        status: social.status === 'ok' || lens.social.length ? 'ok' : social.status,
        profiles: [...lens.social, ...social.profiles]
          .filter((p) => {
            const key = `${p.sourcePlatform}|${(p.handle || p.url).toLowerCase()}`;
            if (seenSocial.has(key)) return false;
            seenSocial.add(key);
            return true;
          })
          // Nearby first (a salon in the city/Kosovo), image matches before profiles found by text.
          .sort((a, b) => {
            const near = (p) => (p.locality === 'city' ? 0 : p.locality === 'kosovo' || p.locality === 'regional' ? 1 : 2);
            return near(a) - near(b) || (b.imageMatch ? 1 : 0) - (a.imageMatch ? 1 : 0);
          })
          .slice(0, 6),
      };
    }
  }

  const comparison = buildComparison({
    userPrice,
    currency: 'EUR',
    characteristics,
    matches,
    searchStatus,
    nearbyStoreCount: local.stores.length,
  });
  // Only override the stored verdict when a real comparison ran; otherwise it
  // is 'unknown' (we never force BUY/SKIP without evidence).
  const legacy = isMock ? { recommendation: analysis.recommendation, priceAssessment: analysis.priceAssessment } : toLegacyFields(comparison);

  const estimatedPrice =
    analysis.estimatedPriceMin !== null && analysis.estimatedPriceMax !== null
      ? Number(((analysis.estimatedPriceMin + analysis.estimatedPriceMax) / 2).toFixed(2))
      : null;

  const [productResult] = await pool.query(
    `INSERT INTO products (name, category, brand, description, estimated_price, currency, image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      finalProductName,
      product.category,
      product.brand,
      analysis.description,
      estimatedPrice,
      analysis.currency || 'EUR',
      relativeImagePath,
    ]
  );
  const productId = productResult.insertId;

  if (estimatedPrice !== null) {
    await pool.query(
      'INSERT INTO price_history (product_id, price, currency, source) VALUES (?, ?, ?, ?)',
      [productId, estimatedPrice, analysis.currency || 'EUR', isMock ? 'mock' : 'ai_estimate']
    );
  }

  const [checkResult] = await pool.query(
    `INSERT INTO product_checks (
       user_id, product_id, image_path, detected_name, detected_category, detected_brand,
       description, estimated_price, estimated_price_min, estimated_price_max, currency,
       user_price, price_assessment, recommendation, confidence, ai_provider, ai_model,
       ai_raw_response, is_mock
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      productId,
      relativeImagePath,
      finalProductName,
      product.category,
      product.brand,
      analysis.description,
      estimatedPrice,
      analysis.estimatedPriceMin,
      analysis.estimatedPriceMax,
      analysis.currency || 'EUR',
      userPrice,
      legacy.priceAssessment,
      legacy.recommendation,
      analysis.confidence,
      provider,
      model,
      JSON.stringify(aiResult.raw ?? null),
      isMock ? 1 : 0,
    ]
  );

  const [rows] = await pool.query('SELECT * FROM product_checks WHERE id = ?', [checkResult.insertId]);

  const fullComparison = {
    ...comparison,
    identifiedAs: lens.identity,
    localStores: local.stores,
    socialProfiles: social.profiles,
    search: { ...comparison.search, localStatus: local.status, socialStatus: social.status, lensStatus: lens.status, kosovoShopsStatus: shopStatus },
  };
  const roomResult = roomContext
    ? { room: roomContext.room, items: roomContext.items, fit: parseRoomFit(aiResult.raw, roomContext.items) }
    : null;
  // One paragraph joining price, room fit and the product (never fails the request).
  const verdict = isMock
    ? null
    : await writeVerdict({
        product: { name: finalProductName, category: product.category, brand: product.brand },
        characteristics,
        identifiedAs: lens.identity,
        comparison: fullComparison,
        roomContext: roomResult,
      });

  res.status(201).json({
    ...serializeCheck(rows[0]),
    comparison: fullComparison,
    characteristics,
    roomContext: roomResult,
    verdict,
  });
});

/** GET /api/product-checks */
const listProductChecks = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM product_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
    [req.user.id]
  );
  res.json({ productChecks: rows.map(serializeCheck) });
});

/** GET /api/product-checks/:id */
const getProductCheck = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1', [
    req.params.id,
    req.user.id,
  ]);

  if (rows.length === 0) {
    throw new ApiError(404, 'Product check not found.');
  }

  res.json(serializeCheck(rows[0]));
});

/** DELETE /api/product-checks — clears the user's entire check history. */
const clearProductChecks = asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM product_checks WHERE user_id = ?', [req.user.id]);
  res.status(204).end();
});










/** PATCH /api/product-checks/:id — update the user's product name. */
const updateProductCheck = asyncHandler(async (req, res) => {
  const name = requireString(req.body.name, 'Product name', {
    maxLength: 255,
  });

  const [rows] = await pool.query(
    'SELECT id, product_id FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1',
    [req.params.id, req.user.id]
  );

  if (rows.length === 0) {
    throw new ApiError(404, 'Product check not found.');
  }

  const productCheck = rows[0];

  await pool.query(
    'UPDATE product_checks SET detected_name = ? WHERE id = ? AND user_id = ?',
    [name, req.params.id, req.user.id]
  );

  if (productCheck.product_id) {
    await pool.query(
      'UPDATE products SET name = ? WHERE id = ?',
      [name, productCheck.product_id]
    );
  }

  // Any room visualization generated from this check shares its name —
  // generated_images.product_name is a denormalized copy that reads
  // actually resolve live from product_checks (see
  // generatedImageController.js), but this keeps the raw column itself
  // truthful too.
  await pool.query('UPDATE generated_images SET product_name = ? WHERE product_check_id = ?', [
    name,
    req.params.id,
  ]);

  const [updatedRows] = await pool.query(
    'SELECT * FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1',
    [req.params.id, req.user.id]
  );

  res.json(serializeCheck(updatedRows[0]));
});














module.exports = {
  createProductCheck,
  listProductChecks,
  getProductCheck,
  updateProductCheck,
  clearProductChecks,
  serializeCheck,
};