/**
 * Product analysis AI service.
 *
 * Calls Anthropic's Claude API (vision-capable, e.g. claude-sonnet-5) with
 * the product photo and asks it to return a structured analysis via tool
 * use, which Anthropic guarantees matches our JSON schema — no fragile
 * "parse the model's prose" step.
 *
 * If AI_API_KEY is not configured, analyzeProductImage() returns a clearly
 * marked mock result instead of throwing, so the rest of the app (and the
 * mobile UI) keeps working without a provider configured. See
 * backend/README.md for setup instructions.
 *
 * Swapping providers later (OpenAI, Gemini, etc.) means changing this file
 * only — routes/controllers only see the shape returned below.
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const env = require('../config/env');

const ANALYSIS_TOOL = {
  name: 'record_product_analysis',
  description: 'Records a structured analysis of a product photo for a buy/skip decision app.',
  input_schema: {
    type: 'object',
    properties: {
      productName: {
        type: 'string',
        description: 'Best guess at the product name. Use "Unknown product" if not identifiable.',
      },
      category: { type: 'string', description: 'General product category, e.g. "Furniture", "Electronics".' },
      brand: { type: 'string', description: 'Visible brand name. Empty string if not visible or unknown.' },
      description: {
        type: 'string',
        description: '2-4 sentence factual description of what is visible in the photo.',
      },
      visibleSpecifications: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short factual specs visibly inferable from the photo (material, size cues, color, etc). Empty array if none.',
      },
      estimatedPriceMin: {
        type: ['number', 'null'],
        description: 'Lower bound of a realistic market price estimate, in the given currency. Null if you are not confident enough to estimate.',
      },
      estimatedPriceMax: {
        type: ['number', 'null'],
        description: 'Upper bound of a realistic market price estimate. Null if not confident.',
      },
      currency: { type: 'string', description: 'ISO 4217 currency code for the estimate, default "EUR".' },
      priceAssessment: {
        type: 'string',
        enum: ['fair', 'good_deal', 'overpriced', 'unknown'],
        description: 'Only "fair"/"good_deal"/"overpriced" if a user price was given and compared against your estimate. Otherwise "unknown".',
      },
      recommendation: {
        type: 'string',
        enum: ['buy', 'consider', 'skip', 'unknown'],
        description: 'Overall buy recommendation. Use "unknown" if there is not enough information.',
      },
      reasoning: {
        type: 'string',
        description: 'Short explanation for the recommendation, mentioning uncertainty where relevant.',
      },
      confidence: {
        type: 'number',
        description: 'Overall confidence in the product identification, from 0 to 1.',
      },
    },
    required: ['productName', 'category', 'description', 'priceAssessment', 'recommendation', 'confidence'],
  },
};

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

function mimeTypeForPath(filePath) {
  return EXT_TO_MIME[path.extname(filePath).toLowerCase()] || 'image/jpeg';
}

function buildClient() {
  if (!env.ai.apiKey) return null;
  return new Anthropic({ apiKey: env.ai.apiKey });
}

function mockAnalysis() {
  return {
    isMock: true,
    provider: null,
    model: null,
    product: {
      name: 'Unknown product',
      category: 'Uncategorized',
      brand: null,
    },
    analysis: {
      description:
        'AI analysis is not configured on this server yet. Set AI_API_KEY (and optionally AI_MODEL) in backend/.env to enable real product recognition via Claude. See backend/README.md.',
      visibleSpecifications: [],
      estimatedPriceMin: null,
      estimatedPriceMax: null,
      currency: 'EUR',
      priceAssessment: 'unknown',
      recommendation: 'unknown',
      reasoning: '',
      confidence: null,
    },
    raw: null,
  };
}

/**
 * @param {object} params
 * @param {string} params.absoluteImagePath - path on disk to the uploaded photo
 * @param {number|null} [params.userPrice] - price the user says the product costs, if known
 * @param {Array<{name: string, category: string}>} [params.userItems] - items the user already owns, for redundancy checks
 */
async function analyzeProductImage({ absoluteImagePath, userPrice, userItems }) {
  const client = buildClient();

  if (!client) {
    return mockAnalysis();
  }

  const imageBuffer = fs.readFileSync(absoluteImagePath);
  const base64Image = imageBuffer.toString('base64');
  const mediaType = mimeTypeForPath(absoluteImagePath);

  const priceContext = userPrice
    ? `The user says this product costs ${userPrice}. Compare your market estimate against that figure and set priceAssessment to "fair", "good_deal", or "overpriced" accordingly.`
    : 'No user-supplied price was given. Set priceAssessment to "unknown" unless you are genuinely confident about typical market pricing for this exact kind of item.';

  const ownedItemsContext =
    userItems && userItems.length
      ? `The user already owns: ${userItems.map((i) => `${i.name} (${i.category})`).join(', ')}. Mention in your reasoning if this product looks redundant with something they already have.`
      : '';

  let message;
  try {
    message = await client.messages.create({
      model: env.ai.model,
      max_tokens: 1024,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: 'tool', name: ANALYSIS_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            {
              type: 'text',
              text:
                'You are a careful product-recognition assistant for a "should I buy this?" app. ' +
                'Look at the photo and identify the product as best you can. Be honest about uncertainty: ' +
                'only give a specific price range if you are reasonably confident about typical pricing for ' +
                'this category of product, otherwise use null. Never invent an exact price you cannot justify. ' +
                `${priceContext} ${ownedItemsContext}`,
            },
          ],
        },
      ],
    });
  } catch (err) {
    const wrapped = new Error(`AI provider request failed: ${err.message}`);
    wrapped.cause = err;
    throw wrapped;
  }

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('AI provider did not return a structured analysis.');
  }

  const result = toolUse.input;

  return {
    isMock: false,
    provider: 'anthropic',
    model: env.ai.model,
    product: {
      name: result.productName || 'Unknown product',
      category: result.category || 'Uncategorized',
      brand: result.brand || null,
    },
    analysis: {
      description: result.description || '',
      visibleSpecifications: result.visibleSpecifications || [],
      estimatedPriceMin: result.estimatedPriceMin ?? null,
      estimatedPriceMax: result.estimatedPriceMax ?? null,
      currency: result.currency || 'EUR',
      priceAssessment: result.priceAssessment || 'unknown',
      recommendation: result.recommendation || 'unknown',
      reasoning: result.reasoning || '',
      confidence: typeof result.confidence === 'number' ? result.confidence : null,
    },
    raw: result,
  };
}

module.exports = { analyzeProductImage };
