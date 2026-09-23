const asyncHandler = require('../utils/asyncHandler');
const { requestModel, getModel } = require('../services/productModelService');

/**
 * POST /api/product-models — body: { cutoutId, retry? }
 * Returns the 3D model for a product cutout, starting generation only if it
 * has never been generated for this user (see productModelService.js).
 * 503 { details: { code: 'not_configured' } } when HF_TOKEN is missing.
 */
const createProductModel = asyncHandler(async (req, res) => {
  const model = await requestModel({
    userId: req.user.id,
    sourceHash: String(req.body.cutoutId || ''),
    retry: req.body.retry === true,
  });
  res.json(model);
});

/** GET /api/product-models/:id — current status (the server polls the provider). */
const getProductModel = asyncHandler(async (req, res) => {
  res.json(await getModel({ userId: req.user.id, id: Number(req.params.id) }));
});

module.exports = { createProductModel, getProductModel };
