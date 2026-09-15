/**
 * Product-search abstraction for "Find for My Home".
 *
 * STATUS: no real store/product source is connected yet. searchProducts()
 * returns a small, clearly-marked (`isMock: true`) illustrative catalog
 * instead — never real store inventory, prices, or links. This exists so
 * the rest of the recommendation architecture (AI reasoning, ranking,
 * location prioritization) can be built and tested end-to-end now, and so
 * that plugging in a real source later only means implementing the branch
 * below — nothing else in the app needs to change.
 *
 * To connect a real source (e.g. GjirafaMall, JYSK Kosovo, or another
 * Kosovo retailer's product feed/API):
 *   1. Implement the actual HTTP call(s) in this file, keeping the same
 *      return shape (`{ isMock: false, provider, products }`).
 *   2. Gate it on a real config value (e.g. PRODUCT_SEARCH_PROVIDER in
 *      backend/.env), the same pattern used for IMAGE_AI_PROVIDER.
 *   3. Never fabricate store names, prices, URLs, or availability for
 *      products that didn't actually come from that source.
 */

const MOCK_CATALOG = [
  {
    id: 'mock-rug-1',
    name: 'Wool-Blend Area Rug',
    category: 'rug',
    price: 79.99,
    currency: 'EUR',
    store: 'Sample Home Store (Mock Data)',
    color: 'Beige',
    material: 'Wool blend',
    dimensions: '160 x 230 cm',
    imageUrl: null,
    productUrl: null,
    availability: 'unknown',
  },
  {
    id: 'mock-floor-lamp-1',
    name: 'Arc Floor Lamp',
    category: 'lighting',
    price: 64.5,
    currency: 'EUR',
    store: 'Sample Home Store (Mock Data)',
    color: 'Black',
    material: 'Metal',
    dimensions: '170 cm height',
    imageUrl: null,
    productUrl: null,
    availability: 'unknown',
  },
  {
    id: 'mock-shelf-1',
    name: 'Wall Storage Shelf',
    category: 'storage',
    price: 45.0,
    currency: 'EUR',
    store: 'Sample Furniture Co. (Mock Data)',
    color: 'Oak',
    material: 'Wood',
    dimensions: '90 x 20 x 25 cm',
    imageUrl: null,
    productUrl: null,
    availability: 'unknown',
  },
  {
    id: 'mock-armchair-1',
    name: 'Accent Armchair',
    category: 'seating',
    price: 189.0,
    currency: 'EUR',
    store: 'Sample Furniture Co. (Mock Data)',
    color: 'Green',
    material: 'Fabric',
    dimensions: '75 x 80 x 85 cm',
    imageUrl: null,
    productUrl: null,
    availability: 'unknown',
  },
  {
    id: 'mock-side-table-1',
    name: 'Round Side Table',
    category: 'table',
    price: 39.99,
    currency: 'EUR',
    store: 'Sample Home Store (Mock Data)',
    color: 'Walnut',
    material: 'Wood',
    dimensions: '40 x 40 x 50 cm',
    imageUrl: null,
    productUrl: null,
    availability: 'unknown',
  },
  {
    id: 'mock-curtains-1',
    name: 'Blackout Curtain Pair',
    category: 'decor',
    price: 34.99,
    currency: 'EUR',
    store: 'Sample Home Store (Mock Data)',
    color: 'Grey',
    material: 'Polyester',
    dimensions: '140 x 260 cm',
    imageUrl: null,
    productUrl: null,
    availability: 'unknown',
  },
];

// The app's user-facing category picker ("Furniture", "Electronics", ...) is
// broader than the mock catalog's per-object categories, so a chosen filter
// expands to every matching catalog category rather than requiring an exact
// string match.
const CATEGORY_SYNONYMS = {
  furniture: ['seating', 'table', 'storage', 'bed'],
  lighting: ['lighting'],
  storage: ['storage'],
  decor: ['decor', 'rug'],
  electronics: ['electronics'],
};

/**
 * @param {object} params
 * @param {string} [params.category] - a user-facing category filter, e.g. "Furniture". Omit to search everything.
 * @param {string} [params.city] - approximate user city, for future store-proximity ranking (unused in mock mode).
 * @returns {Promise<{isMock: boolean, provider: string|null, products: Array<object>}>}
 */
async function searchProducts({ category, city } = {}) {
  const catalogCategories = category ? CATEGORY_SYNONYMS[category.toLowerCase()] : null;

  const products = catalogCategories
    ? MOCK_CATALOG.filter((p) => catalogCategories.includes(p.category.toLowerCase()))
    : MOCK_CATALOG;

  return {
    isMock: true,
    provider: null,
    // Not used yet — kept in the signature so a real implementation can rank
    // by distance to `city` without changing the caller's contract.
    city: city || null,
    products,
  };
}

module.exports = { searchProducts };
