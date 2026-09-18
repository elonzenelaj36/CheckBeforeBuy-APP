/**
 * External product-match search.
 *
 * Uses Google Cloud Vision API's Web Detection feature to find real,
 * already-existing web pages that match (or are visually similar to) a
 * photo the user took, so the app can link out to the original page.
 *
 * This deliberately does NOT scrape, store, or catalog anything: every
 * call is transient — made on demand, shown to the user once, and never
 * persisted. See the "Analyze redesign" discussion in project notes for
 * why (Kosovo retailers' own Terms of Service prohibit systematic
 * scraping/database-building, but linking to a page found via an
 * authorized search API does not).
 *
 * If VISION_API_KEY is not configured, findProductMatches() returns a
 * clearly marked mock result instead of throwing, same pattern as
 * aiService.js.
 */

const fs = require('fs');
const env = require('../config/env');

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
const MAX_RESULTS = 5;

function mockMatches() {
  return {
    isMock: true,
    provider: null,
    matches: [
      {
        store: 'Example Home Store (Mock Data)',
        pageTitle: 'Similar product — mock result',
        url: null,
      },
    ],
  };
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * @param {object} params
 * @param {string} params.absoluteImagePath - path on disk to the product photo
 */
async function findProductMatches({ absoluteImagePath }) {
  if (!env.vision.apiKey) {
    return mockMatches();
  }

  const imageBuffer = fs.readFileSync(absoluteImagePath);
  const base64Image = imageBuffer.toString('base64');

  let response;
  try {
    response = await fetch(`${VISION_ENDPOINT}?key=${env.vision.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Image },
            features: [{ type: 'WEB_DETECTION', maxResults: MAX_RESULTS }],
          },
        ],
      }),
    });
  } catch (err) {
    const wrapped = new Error(`Vision API request failed: ${err.message}`);
    wrapped.cause = err;
    throw wrapped;
  }

  if (!response.ok) {
    throw new Error(`Vision API request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const webDetection = data.responses?.[0]?.webDetection || {};
  const pages = Array.isArray(webDetection.pagesWithMatchingImages) ? webDetection.pagesWithMatchingImages : [];

  const matches = pages.slice(0, MAX_RESULTS).map((page) => ({
    store: hostnameFromUrl(page.url),
    pageTitle: page.pageTitle || null,
    url: page.url,
  }));

  return {
    isMock: false,
    provider: 'google_vision_web_detection',
    matches,
  };
}

module.exports = { findProductMatches };
