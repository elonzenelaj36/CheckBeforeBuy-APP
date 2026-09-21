/**
 * Multi-product room visualization contract.
 *
 * One code path for 1..N products:
 *
 *   mockGenerateSessionVisualization({ roomImage, roomType, products })
 *
 * `products` is always an array, in stable order. Original room/product
 * images are always the inputs — never a previously generated image.
 *
 * NOTHING in this file calls an image-generation provider. The mock is used
 * while VISUALIZATION_MOCK is not 'false'; the real path is
 * imageGenerationService.generateRoomVisualization({ roomImagePath, products, roomType }).
 */

const MAX_PRODUCTS = 8;

/**
 * Validates and normalizes the generation request.
 * @returns {{roomImage: string|null, roomType: string, products: Array<{image: string|null, name: string, category: string|null, brand: string|null, model: string|null, characteristics: string[]}>}}
 */
function buildGenerationRequest({ roomImage = null, roomType, products }) {
  if (!Array.isArray(products) || products.length === 0) {
    const err = new Error('At least one product is required.');
    err.statusCode = 400;
    throw err;
  }
  if (products.length > MAX_PRODUCTS) {
    const err = new Error(`At most ${MAX_PRODUCTS} products can be placed in one visualization.`);
    err.statusCode = 400;
    throw err;
  }

  return {
    roomImage,
    roomType: roomType || 'room',
    products: products.map((p, index) => ({
      image: p.image ?? null,
      name: String(p.name || `Product ${index + 1}`).slice(0, 120),
      category: p.category || null,
      brand: p.brand || null,
      model: p.model || null,
      characteristics: Array.isArray(p.characteristics) ? p.characteristics.slice(0, 10) : [],
    })),
  };
}

/** Prompt the real provider will receive later. Product order = array order. */
function buildMultiProductPrompt({ roomType, products }) {
  const list = products
    .map((p, i) => {
      const details = [p.category, p.brand, p.model].filter(Boolean).join(', ');
      return `${i + 1}. ${p.name}${details ? ` (${details})` : ''}`;
    })
    .join('\n');

  return [
    `Image 0 is a photo of a ${roomType}. Images 1 to ${products.length} are the original product photos, in the order listed below.`,
    'Place all of the provided products naturally into the provided room.',
    'Use the ORIGINAL products as accurately as possible.',
    'Preserve: product shape, color, material, proportions and design; room architecture, layout, lighting and perspective.',
    'Do not replace the products with similar objects.',
    'Do not remove existing furniture unless explicitly instructed.',
    'Place each new product where it naturally belongs in the room.',
    'Make all products appear in the SAME final room image.',
    '',
    'Products:',
    list,
  ].join('\n');
}

/** Mock only — no network, no provider. */
function mockGenerate(request) {
  return {
    success: true,
    mock: true,
    generatedImage: null, // the client shows the original room photo as its placeholder
    productsUsed: request.products.length,
  };
}

async function mockGenerateSessionVisualization(input) {
  const request = buildGenerationRequest(input);
  const prompt = buildMultiProductPrompt(request);
  console.log(
    `[MOCK GENERATION] no image provider called — ${request.products.length} product(s): ` +
      request.products.map((p) => p.name).join(' | ')
  );
  console.log(`[MOCK GENERATION] future prompt:\n${prompt}`);
  return { ...mockGenerate(request), prompt };
}

module.exports = {
  MAX_PRODUCTS,
  buildGenerationRequest,
  buildMultiProductPrompt,
  mockGenerateSessionVisualization,
};
