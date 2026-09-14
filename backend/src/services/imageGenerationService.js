/**
 * Room-visualization (product-in-room image generation) abstraction.
 *
 * STATUS: no image-generation provider is wired up yet.
 *
 * Anthropic's Claude API (used by services/aiService.js for product
 * analysis) does not generate images, so it cannot power this feature.
 * Real image-to-image / inpainting generation needs a separate provider
 * (e.g. an image model API) and its own API key — a decision left to
 * whoever configures this deployment, since it has real cost implications.
 *
 * What IS implemented:
 *   - the full request/response contract below
 *   - the /api/generated-images routes and MySQL persistence
 *   - a "pending" status so the mobile app can show a clear, honest message
 *     instead of a fake generated image
 *
 * To wire up a real provider: implement the provider call below, keeping
 * the same return shape. Nothing else in the app needs to change.
 */

const env = require('../config/env');

/**
 * @param {object} params
 * @param {string} params.roomImagePath - relative path to the room photo
 * @param {string} params.productImagePath - relative path to the product photo
 * @param {string} params.roomType
 * @returns {Promise<{status: 'pending'|'completed'|'failed', generatedImagePath: string|null, provider: string|null, message?: string}>}
 */
async function generateRoomVisualization({ roomImagePath, productImagePath, roomType }) {
  if (!env.imageAi.provider || !env.imageAi.apiKey) {
    return {
      status: 'pending',
      generatedImagePath: null,
      provider: null,
      message:
        'Room visualization AI is not configured on this server yet. Set IMAGE_AI_PROVIDER and ' +
        'IMAGE_AI_API_KEY in backend/.env once an image-generation provider is chosen. ' +
        'See backend/README.md → "Room visualization AI".',
    };
  }

  // Placeholder for a real provider call. Intentionally left unimplemented
  // until a provider + API key are configured — see the module comment.
  throw new Error(`Image AI provider "${env.imageAi.provider}" is not implemented yet.`);
}

module.exports = { generateRoomVisualization };
