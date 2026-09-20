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
const { GoogleGenAI } = require('@google/genai');
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

const ROOM_ITEM_CATEGORIES = [
  'seating',
  'table',
  'storage',
  'lighting',
  'electronics',
  'bed',
  'rug',
  'decor',
  'appliance',
  'other',
];

const ROOM_ANALYSIS_TOOL = {
  name: 'record_room_items',
  description:
    'Records the distinct physical furniture/objects recognizable across one or more photos of the same room.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Short common name of the object, e.g. "Sofa", "Coffee Table", "Floor Lamp".',
            },
            category: {
              type: 'string',
              enum: ROOM_ITEM_CATEGORIES,
              description: 'General category of the object.',
            },
            description: {
              type: 'string',
              description:
                'Short factual description if visibly notable (color, material, approximate size). Empty string if nothing notable.',
            },
          },
          required: ['name', 'category'],
        },
        description:
          'One entry per distinct physical object actually visible in the photos. If the same object appears in ' +
          'multiple photos (e.g. the same sofa from two angles), list it only once. Do not invent objects you ' +
          'cannot reasonably identify, and do not list structural elements like walls, floors, doors, or windows.',
      },
    },
    required: ['items'],
  },
};

const MOCK_ROOM_ITEMS = {
  'Living Room': [
    { name: 'Sofa', category: 'seating', description: 'Fabric three-seat sofa.' },
    { name: 'Coffee Table', category: 'table', description: 'Rectangular wooden coffee table.' },
    { name: 'TV', category: 'electronics', description: 'Flat-screen television.' },
    { name: 'TV Stand', category: 'storage', description: 'Low storage unit under the TV.' },
  ],
  Bedroom: [
    { name: 'Bed', category: 'bed', description: 'Double bed with headboard.' },
    { name: 'Wardrobe', category: 'storage', description: 'Freestanding wardrobe.' },
    { name: 'Nightstand', category: 'storage', description: 'Small bedside table.' },
  ],
  Kitchen: [
    { name: 'Dining Table', category: 'table', description: 'Small kitchen table.' },
    { name: 'Chairs', category: 'seating', description: 'Set of dining chairs.' },
    { name: 'Refrigerator', category: 'appliance', description: 'Standard fridge-freezer.' },
  ],
  Bathroom: [
    { name: 'Sink Cabinet', category: 'storage', description: 'Cabinet under the sink.' },
    { name: 'Mirror', category: 'decor', description: 'Wall-mounted mirror.' },
  ],
  'Dining Room': [
    { name: 'Dining Table', category: 'table', description: 'Table for four to six.' },
    { name: 'Dining Chairs', category: 'seating', description: 'Matching dining chairs.' },
  ],
  Office: [
    { name: 'Desk', category: 'table', description: 'Work desk.' },
    { name: 'Office Chair', category: 'seating', description: 'Adjustable desk chair.' },
    { name: 'Bookshelf', category: 'storage', description: 'Open bookshelf.' },
  ],
  'Gaming Room': [
    { name: 'Gaming Chair', category: 'seating', description: 'Ergonomic gaming chair.' },
    { name: 'Desk', category: 'table', description: 'Gaming/computer desk.' },
    { name: 'Monitor', category: 'electronics', description: 'Desktop monitor.' },
  ],
};

function mockRoomAnalysis({ roomType, existingItems }) {
  const existingNames = new Set((existingItems || []).map((i) => i.name.toLowerCase()));
  const candidates = MOCK_ROOM_ITEMS[roomType] || MOCK_ROOM_ITEMS['Living Room'];
  const items = candidates.filter((item) => !existingNames.has(item.name.toLowerCase()));

  return {
    isMock: true,
    provider: null,
    model: null,
    items,
    raw: null,
  };
}

function buildClient() {
  if (!env.ai.apiKey) return null;
  // AI_API_KEY is a Gemini/Groq key when AI_PROVIDER=gemini/groq — never send it to
  // Anthropic. Room/home analysis stay on Anthropic, so they fall back to
  // their mock results while Gemini is the configured provider.
  if (env.ai.provider === 'gemini' || env.ai.provider === 'groq') return null;
  return new Anthropic({ apiKey: env.ai.apiKey });
}

/**
 * Which provider analyzeProductImage() should use. An explicit AI_PROVIDER
 * always wins; otherwise we prefer anthropic when a key is already
 * configured (so existing deployments don't change behavior), and
 * otherwise default to the free local ollama path.
 */
function resolveProductAnalysisProvider() {
  if (env.ai.provider) return env.ai.provider;
  if (env.ai.apiKey) return 'anthropic';
  return 'ollama';
}

function mockAnalysis(reasonOverride) {
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
        reasonOverride ||
        (env.ai.provider === 'gemini' || env.ai.provider === 'groq'
          ? `${env.ai.provider === 'groq' ? 'Groq' : 'Gemini'} AI is not configured on this server yet. Set AI_API_KEY in backend/.env.`
          : 'AI analysis is not configured on this server yet. Set AI_API_KEY (and optionally AI_MODEL) in backend/.env to enable real product recognition via Claude, or run Ollama locally and set OLLAMA_MODEL. See backend/README.md.'),
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

const OLLAMA_ANALYSIS_INSTRUCTIONS = `You are a careful product-recognition assistant for a "should I buy this?" app.
Look at the photo and identify the product as best you can. Be honest about uncertainty: only give a
specific price range if you are reasonably confident about typical pricing for this category of product,
otherwise use null for the price fields. Never invent an exact price you cannot justify.

Respond with ONLY a single JSON object (no markdown, no prose, no code fences) with exactly these fields:
{
  "productName": string,            // best guess, or "Unknown product" if not identifiable
  "category": string,               // e.g. "Furniture", "Electronics"
  "brand": string,                  // visible brand name, "" if not visible/unknown
  "description": string,            // 2-4 factual sentences about what is visible
  "visibleSpecifications": string[],// short factual specs (material, size cues, color), [] if none
  "estimatedPriceMin": number|null, // lower bound of a realistic market price, null if not confident
  "estimatedPriceMax": number|null, // upper bound, null if not confident
  "currency": string,               // ISO 4217 code, default "EUR"
  "priceAssessment": "fair"|"good_deal"|"overpriced"|"unknown",
  "recommendation": "buy"|"consider"|"skip"|"unknown",
  "reasoning": string,               // short explanation, mentioning uncertainty where relevant
  "confidence": number               // 0 to 1, overall confidence in the identification
}`;

const OLLAMA_TIMEOUT_MS = 120000;

/**
 * Local, free product analysis via Ollama (e.g. llama3.2-vision, qwen2.5vl).
 * Ollama's `format: "json"` guarantees syntactically valid JSON but not a
 * specific schema, so the prompt spells out the exact shape explicitly —
 * unlike Anthropic's tool-use, there's no server-side schema guarantee here.
 */
async function analyzeWithOllama({ absoluteImagePath, priceContext, ownedItemsContext }) {
  const imageBuffer = fs.readFileSync(absoluteImagePath);
  const base64Image = imageBuffer.toString('base64');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${env.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.ollama.model,
        stream: false,
        format: 'json',
        messages: [
          {
            role: 'user',
            content: `${OLLAMA_ANALYSIS_INSTRUCTIONS}\n\n${priceContext} ${ownedItemsContext}`,
            images: [base64Image],
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();

  let result;
  try {
    result = JSON.parse(data.message.content);
  } catch (err) {
    throw new Error(`Ollama returned a non-JSON response: ${err.message}`);
  }

  return {
    isMock: false,
    provider: 'ollama',
    model: env.ollama.model,
    product: {
      name: result.productName || 'Unknown product',
      category: result.category || 'Uncategorized',
      brand: result.brand || null,
    },
    analysis: {
      description: result.description || '',
      visibleSpecifications: Array.isArray(result.visibleSpecifications) ? result.visibleSpecifications : [],
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

/**
 * Product analysis via Google Gemini (@google/genai). Sends the photo as
 * inline base64 data and asks for JSON output; the prompt spells out the
 * exact shape (same one used for Ollama). Real failures are thrown, not
 * converted to mock data, so the controller returns its normal error.
 */
async function analyzeWithGemini({ absoluteImagePath, priceContext, ownedItemsContext }) {
  const ai = new GoogleGenAI({ apiKey: env.ai.apiKey });
  const imageBase64 = fs.readFileSync(absoluteImagePath).toString('base64');

  let response;
  try {
    response = await ai.models.generateContent({
      model: env.ai.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeTypeForPath(absoluteImagePath), data: imageBase64 } },
            { text: `${OLLAMA_ANALYSIS_INSTRUCTIONS}\n\n${priceContext} ${ownedItemsContext}` },
          ],
        },
      ],
      config: { responseMimeType: 'application/json' },
    });
  } catch (err) {
    console.error('[aiService] Gemini request failed:', err);
    const wrapped = new Error(`AI provider request failed: ${err.message}`);
    wrapped.cause = err;
    throw wrapped;
  }

  let result;
  try {
    result = JSON.parse(response.text);
  } catch (err) {
    console.error('[aiService] Gemini returned non-JSON output:', response.text);
    throw new Error(`Gemini returned a non-JSON response: ${err.message}`);
  }

  return {
    isMock: false,
    provider: 'gemini',
    model: env.ai.model,
    product: {
      name: result.productName || 'Unknown product',
      category: result.category || 'Uncategorized',
      brand: result.brand || null,
    },
    analysis: {
      description: result.description || '',
      visibleSpecifications: Array.isArray(result.visibleSpecifications) ? result.visibleSpecifications : [],
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

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TIMEOUT_MS = 60000;

/**
 * Product analysis via Groq's OpenAI-compatible chat completions API.
 * Image goes in as a base64 data URL; JSON mode guarantees valid JSON, the
 * prompt (shared with Ollama/Gemini) defines the shape. Real failures are
 * thrown, never turned into mock data.
 */
async function analyzeWithGroq({ absoluteImagePath, priceContext, ownedItemsContext }) {
  const imageBase64 = fs.readFileSync(absoluteImagePath).toString('base64');
  const dataUrl = `data:${mimeTypeForPath(absoluteImagePath)};base64,${imageBase64}`;

  let data;
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ai.apiKey}` },
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      body: JSON.stringify({
        model: env.ai.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${OLLAMA_ANALYSIS_INSTRUCTIONS}\n\n${priceContext} ${ownedItemsContext}` },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    data = await response.json();
  } catch (err) {
    console.error('[aiService] Groq request failed:', err.message);
    const wrapped = new Error(`AI provider request failed: ${err.message}`);
    wrapped.cause = err;
    throw wrapped;
  }

  const content = data.choices?.[0]?.message?.content;
  let result;
  try {
    result = JSON.parse(content);
  } catch (err) {
    console.error('[aiService] Groq returned non-JSON output:', content);
    throw new Error(`Groq returned a non-JSON response: ${err.message}`);
  }

  return {
    isMock: false,
    provider: 'groq',
    model: env.ai.model,
    product: {
      name: result.productName || 'Unknown product',
      category: result.category || 'Uncategorized',
      brand: result.brand || null,
    },
    analysis: {
      description: result.description || '',
      visibleSpecifications: Array.isArray(result.visibleSpecifications) ? result.visibleSpecifications : [],
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

/**
 * @param {object} params
 * @param {string} params.absoluteImagePath - path on disk to the uploaded photo
 * @param {number|null} [params.userPrice] - price the user says the product costs, if known
 * @param {Array<{name: string, category: string}>} [params.userItems] - items the user already owns, for redundancy checks
 */
async function analyzeProductImage({ absoluteImagePath, userPrice, userItems }) {
  const priceContext = userPrice
    ? `The user says this product costs ${userPrice}. Compare your market estimate against that figure and set priceAssessment to "fair", "good_deal", or "overpriced" accordingly.`
    : 'No user-supplied price was given. Set priceAssessment to "unknown" unless you are genuinely confident about typical market pricing for this exact kind of item.';

  const ownedItemsContext =
    userItems && userItems.length
      ? `The user already owns: ${userItems.map((i) => `${i.name} (${i.category})`).join(', ')}. Mention in your reasoning if this product looks redundant with something they already have.`
      : '';

  const provider = resolveProductAnalysisProvider();

  if (provider === 'gemini') {
    if (!env.ai.apiKey) {
      console.log('[aiService] Gemini AI: MOCK MODE');
      return mockAnalysis();
    }
    console.log(`[aiService] Gemini AI: REAL MODE (${env.ai.model})`);
    return analyzeWithGemini({ absoluteImagePath, priceContext, ownedItemsContext });
  }

  if (provider === 'groq') {
    if (!env.ai.apiKey) {
      console.log('[aiService] Groq AI: MOCK MODE');
      return mockAnalysis();
    }
    console.log(`[aiService] Groq AI: REAL MODE (${env.ai.model})`);
    return analyzeWithGroq({ absoluteImagePath, priceContext, ownedItemsContext });
  }

  if (provider === 'ollama') {
    try {
      return await analyzeWithOllama({ absoluteImagePath, priceContext, ownedItemsContext });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[aiService] Ollama analysis failed, falling back to mock:', err.message);
      return mockAnalysis(
        `Local AI (Ollama) isn't reachable at ${env.ollama.baseUrl}, or the "${env.ollama.model}" model isn't pulled. ` +
          'Run `ollama pull ' +
          env.ollama.model +
          '` and make sure `ollama serve` is running, or set AI_API_KEY to use Claude instead. See backend/README.md.'
      );
    }
  }

  const client = buildClient();

  if (!client) {
    return mockAnalysis();
  }

  const imageBuffer = fs.readFileSync(absoluteImagePath);
  const base64Image = imageBuffer.toString('base64');
  const mediaType = mimeTypeForPath(absoluteImagePath);

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

const ROOM_IMAGE_LIMIT = 5;

/**
 * Analyzes one or more photos of the same room and returns the distinct
 * physical objects recognizable in them.
 *
 * @param {object} params
 * @param {string[]} params.absoluteImagePaths - paths on disk to the room's photos (analyzes at most the first 5)
 * @param {string} params.roomType - e.g. "Living Room", used for mock fallback and prompt context
 * @param {Array<{name: string, category: string}>} [params.existingItems] - items already recorded for this room, so the AI can avoid re-listing them
 */
async function analyzeRoomImages({ absoluteImagePaths, roomType, existingItems }) {
  const client = buildClient();

  if (!client) {
    return mockRoomAnalysis({ roomType, existingItems });
  }

  const imagePaths = (absoluteImagePaths || []).slice(0, ROOM_IMAGE_LIMIT);
  if (imagePaths.length === 0) {
    return { isMock: false, provider: 'anthropic', model: env.ai.model, items: [], raw: null };
  }

  const imageBlocks = imagePaths.map((imagePath) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: mimeTypeForPath(imagePath),
      data: fs.readFileSync(imagePath).toString('base64'),
    },
  }));

  const existingContext =
    existingItems && existingItems.length
      ? `Items already recorded for this room: ${existingItems
          .map((i) => `${i.name} (${i.category})`)
          .join(', ')}. Do not list these again unless you see a genuinely different object of the same kind (e.g. a second, different nightstand).`
      : 'No items have been recorded for this room yet.';

  let message;
  try {
    message = await client.messages.create({
      model: env.ai.model,
      max_tokens: 1024,
      tools: [ROOM_ANALYSIS_TOOL],
      tool_choice: { type: 'tool', name: ROOM_ANALYSIS_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text:
                `These are ${imageBlocks.length} photo(s) of the same "${roomType}". Identify the distinct pieces ` +
                'of furniture and other recognizable objects actually visible. Only include objects you can ' +
                'reasonably identify — never invent objects that are not visible. If the same physical object ' +
                `appears in more than one photo, record it once. ${existingContext}`,
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
    throw new Error('AI provider did not return a structured room analysis.');
  }

  const items = Array.isArray(toolUse.input.items) ? toolUse.input.items : [];

  return {
    isMock: false,
    provider: 'anthropic',
    model: env.ai.model,
    items: items.map((item) => ({
      name: item.name || '',
      category: item.category || 'other',
      description: item.description || '',
    })),
    raw: toolUse.input,
  };
}

const HOME_RECOMMENDATION_TOOL = {
  name: 'record_home_recommendations',
  description:
    'Records which candidate products (by id) are genuinely useful additions to the user\'s home, and why, ' +
    'given what they already own.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          '2-4 sentence factual summary of what the user\'s home already has and what, if anything, would ' +
          'meaningfully improve it. Honest and non-salesy — it is fine to say nothing more is needed.',
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'id of the candidate product being recommended.' },
            reason: {
              type: 'string',
              description:
                'Short concrete reason this specific product suits this specific home (references what the ' +
                'user already has, e.g. "Matches your existing wooden furniture" or "Your room has no rug yet").',
            },
          },
          required: ['productId', 'reason'],
        },
        description:
          'Only candidate products that are genuinely useful additions — do not include one for every category ' +
          'just to fill the list. It is correct to return fewer recommendations than candidates, including zero.',
      },
    },
    required: ['summary', 'recommendations'],
  },
};

function mockHomeNeeds({ rooms, userItems, candidateProducts }) {
  const roomCount = rooms.length;
  const itemCount = userItems.length;

  const summary =
    roomCount === 0
      ? 'Add a room to My Home so we can understand your space before recommending products.'
      : itemCount === 0
        ? `We found ${roomCount} room${roomCount === 1 ? '' : 's'} but no detected items yet — analyze your room photos so recommendations can reflect what you already own.`
        : `Your home has ${itemCount} detected item${itemCount === 1 ? '' : 's'} across ${roomCount} room${roomCount === 1 ? '' : 's'}. AI product recommendations are not configured on this server yet, so the picks below are a mock illustration rather than a real personalized analysis.`;

  const recommendations = candidateProducts.slice(0, 3).map((product) => ({
    productId: product.id,
    reason: 'Mock recommendation — AI reasoning is not configured on this server yet.',
  }));

  return { isMock: true, provider: null, model: null, summary, recommendations, raw: null };
}

/**
 * Given the user's home context (rooms, detected items) and a list of real
 * candidate products already fetched from productService, decides which
 * candidates are genuinely useful and explains why — or recommends none.
 *
 * @param {object} params
 * @param {Array<{name: string, roomType: string}>} params.rooms
 * @param {Array<{name: string, category: string, roomName: string|null}>} params.userItems
 * @param {Array<{id: string, name: string, category: string, price: number|null, store: string}>} params.candidateProducts
 * @param {Array<{name: string, category: string}>} [params.recentProductChecks]
 */
async function analyzeHomeNeeds({ rooms, userItems, candidateProducts, recentProductChecks }) {
  const client = buildClient();

  if (!client || candidateProducts.length === 0) {
    return mockHomeNeeds({ rooms, userItems, candidateProducts });
  }

  const roomsContext = rooms.length
    ? rooms.map((r) => `${r.name} (${r.roomType})`).join(', ')
    : 'No rooms added yet.';

  const itemsContext = userItems.length
    ? userItems.map((i) => `${i.name} (${i.category})${i.roomName ? ` in ${i.roomName}` : ''}`).join(', ')
    : 'No items detected yet.';

  const checksContext =
    recentProductChecks && recentProductChecks.length
      ? `Products the user recently checked (for context only, not necessarily owned): ${recentProductChecks
          .map((c) => `${c.name} (${c.category})`)
          .join(', ')}.`
      : '';

  const candidatesContext = candidateProducts
    .map(
      (p) =>
        `id=${p.id} | ${p.name} | category: ${p.category} | store: ${p.store} | price: ${p.price != null ? `${p.price} ${p.currency}` : 'unknown'}`
    )
    .join('\n');

  let message;
  try {
    message = await client.messages.create({
      model: env.ai.model,
      max_tokens: 1024,
      tools: [HOME_RECOMMENDATION_TOOL],
      tool_choice: { type: 'tool', name: HOME_RECOMMENDATION_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'You are the recommendation engine for "Check Before Buy", an app whose core principle is ' +
                'discouraging unnecessary purchases and only suggesting products that genuinely complement what ' +
                'a user already owns. Never recommend a product just because it exists — it is correct and ' +
                'expected to recommend nothing, or say the user already has enough of something.\n\n' +
                `User's rooms: ${roomsContext}\n` +
                `User's detected items: ${itemsContext}\n` +
                `${checksContext}\n\n` +
                'Candidate products (only recommend from this list, referencing them by id — never invent a ' +
                `product that isn't listed here):\n${candidatesContext}`,
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
    throw new Error('AI provider did not return structured home recommendations.');
  }

  const validIds = new Set(candidateProducts.map((p) => p.id));
  const recommendations = (Array.isArray(toolUse.input.recommendations) ? toolUse.input.recommendations : [])
    .filter((r) => validIds.has(String(r.productId)))
    .map((r) => ({ productId: String(r.productId), reason: r.reason || '' }));

  return {
    isMock: false,
    provider: 'anthropic',
    model: env.ai.model,
    summary: toolUse.input.summary || '',
    recommendations,
    raw: toolUse.input,
  };
}

module.exports = { analyzeProductImage, analyzeRoomImages, analyzeHomeNeeds };
