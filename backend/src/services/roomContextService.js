/**
 * Room context for the Analyze Product flow.
 *
 * When the user says which room a product is for, the items already
 * detected in that room (Items Detected — see roomItemDetectionService.js)
 * are handed to the product analysis as evidence, so it can reason about
 * duplication, replacement, complementing and missing functions instead of
 * "you already have a chair".
 *
 * Nothing new is detected here: this only reads what the room already has
 * (user_items + room_item_observations), for photo, 180° and 360° rooms
 * alike. Wording follows the evidence:
 *   - high detection confidence  -> "was detected"
 *   - lower / unknown confidence -> "a …-like item may be present"
 *   - not in the list            -> "was not detected in this room" (never
 *     "the user does not own one": it may be elsewhere, or out of view)
 */

const { pool } = require('../db/connection');

const HIGH_CONFIDENCE = 0.8;
const MAX_ITEMS = 40;

/** Fetches a query that depends on an optional table/migration; null if it isn't there. */
async function optionalQuery(sql, params) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') return null;
    throw err;
  }
}

/** "tv stand" / "Tv stand" -> "TV stand" for readable prompts and UI. */
function displayName(name) {
  const s = String(name || '').trim();
  return s.replace(/\btv\b/gi, 'TV');
}

/**
 * Groups same-named items ("Nightstand" x2) and assigns each group a certainty.
 * Manual items are the user's own statement -> certain. AI items without any
 * detection record (older placeholder analyses) are treated as uncertain.
 */
function summarizeItems(rows) {
  // Certainty is decided per item first, so a confident sighting never vouches
  // for a second, uncertain one of the same name.
  const groups = new Map();
  for (const r of rows) {
    const c = r.confidence !== null && r.confidence !== undefined ? Number(r.confidence) : null;
    let certainty;
    if (r.source === 'manual') certainty = 'listed';
    else if (c !== null && c >= HIGH_CONFIDENCE) certainty = 'detected';
    else certainty = 'possible';
    // Items that look different (color/material) stay separate: "white bed" and "dark bed" are different evidence.
    const looks = [r.color, r.material].filter(Boolean).join(' ') || null;
    const key = `${String(r.name).toLowerCase()}|${certainty}|${looks || ''}`;
    const g = groups.get(key) || { name: displayName(r.name), category: r.category, looks, count: 0, confidence: null, views: 0, certainty };
    g.count += 1;
    if (c !== null && (g.confidence === null || c > g.confidence)) g.confidence = Math.round(c * 100) / 100;
    g.views = Math.max(g.views, Number(r.views || 0));
    groups.set(key, g);
  }
  return [...groups.values()];
}

function describeItem(i) {
  const n = `${i.count > 1 ? `${i.count}× ` : ''}${i.name}${i.looks ? ` [${i.looks}]` : ''}`;
  if (i.certainty === 'listed') return `${n} (added by the user)`;
  if (i.certainty === 'detected') return `${n} (detected, confidence ${i.confidence})`;
  const conf = i.confidence !== null ? `, confidence ${i.confidence}` : ', confidence unknown';
  return `a ${i.name.toLowerCase()}-like item${i.looks ? ` [${i.looks}]` : ''}${i.count > 1 ? ` (×${i.count})` : ''} may be present${conf}`;
}

/**
 * @returns {Promise<null | {
 *   room: {id: string, name: string, roomType: string, kind: 'photo'|'180'|'360'},
 *   items: Array, elsewhere: Array, detectionAvailable: boolean, promptText: string
 * }>} null when the room doesn't exist or isn't the user's (caller then behaves as if no room was chosen)
 */
async function buildRoomContext(userId, roomId) {
  const id = Number(roomId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const [roomRows] = await pool.query('SELECT id, name, room_type FROM rooms WHERE id = ? AND user_id = ?', [id, userId]);
  if (!roomRows.length) return null;
  const roomRow = roomRows[0];

  const captureRows = await optionalQuery('SELECT mode FROM room_captures WHERE room_id = ? ORDER BY id DESC LIMIT 1', [id]);
  const kind = captureRows && captureRows.length ? captureRows[0].mode : 'photo';

  // Items of this room with their best detection confidence and how many views saw them.
  let itemRows = await optionalQuery(
    `SELECT ui.name, ui.category, ui.source, ui.color, ui.material, MAX(o.confidence) AS confidence, COUNT(o.id) AS views
     FROM user_items ui
     LEFT JOIN room_item_observations o ON o.user_item_id = ui.id
     WHERE ui.user_id = ? AND ui.room_id = ?
     GROUP BY ui.id
     ORDER BY ui.id
     LIMIT ${MAX_ITEMS}`,
    [userId, id]
  );
  const detectionAvailable = itemRows !== null;
  if (itemRows === null) {
    [itemRows] = await pool.query(
      `SELECT name, category, source, NULL AS confidence, 0 AS views FROM user_items WHERE user_id = ? AND room_id = ? LIMIT ${MAX_ITEMS}`,
      [userId, id]
    );
  }

  // The rest of the user's inventory (other rooms / unassigned). Named as "owned
  // elsewhere" so an item missing from THIS room is never read as "not owned".
  const [otherRows] = await pool.query(
    `SELECT ui.name, ui.category, ui.source, r.name AS room_name
     FROM user_items ui LEFT JOIN rooms r ON r.id = ui.room_id
     WHERE ui.user_id = ? AND (ui.room_id IS NULL OR ui.room_id <> ?)
     LIMIT ${MAX_ITEMS}`,
    [userId, id]
  );

  const items = summarizeItems(itemRows);
  const elsewhere = otherRows.map((r) => ({ name: displayName(r.name), category: r.category, roomName: r.room_name || null }));

  const kindText =
    kind === 'photo' ? 'a photo of the room' : `a ${kind}° capture of the room (several views, so most of the room was seen)`;
  const lines = [];
  lines.push(`ROOM CONTEXT: the user is considering this product for their room "${roomRow.name}" (${roomRow.room_type}).`);
  if (items.length) {
    lines.push(`Items found in this room from ${kindText}: ${items.map(describeItem).join('; ')}.`);
  } else {
    lines.push(`No items are recorded for this room yet (item detection may not have been run on ${kindText}).`);
  }
  if (kind === 'photo') {
    lines.push('A single photo may not show the whole room, so items outside the photo are unknown.');
  }
  if (elsewhere.length) {
    lines.push(
      `Elsewhere in the user's home (other rooms or unassigned): ${elsewhere
        .slice(0, 25)
        .map((e) => (e.roomName ? `${e.name} (${e.roomName})` : e.name))
        .join(', ')}.`
    );
  }
  lines.push(
    [
      'Use this room evidence carefully:',
      '- Say "was detected in this room" only for items marked detected; for "may be present" items say that a similar item may already be there.',
      '- If something is NOT in the list, say it "was not detected in the selected room" — never claim the user does not own it.',
      '- Do not recommend skipping just because an item of the same broad kind exists. Compare function: is the product a duplicate (same function, same place), a possible replacement/upgrade, something that complements what is there (e.g. a side table next to an armchair), or does it fill a function the room seems to lack?',
      '- Base the price verdict on the product itself; the room only affects whether it fits a need.',
      '- Where item colors/materials are given in [brackets], say whether the product\'s color and material go well with them (e.g. matches the bed\'s dark wood). Never guess colors that are not given.',
      'Add one more field to your JSON object:',
      '"roomFit": { "relation": "duplicate"|"replacement"|"complement"|"fills_gap"|"unclear",',
      '             "summary": string,          // 1-3 sentences for the user, following the wording rules above',
      '             "relatedItems": string[] }  // names of the room items your summary refers to ([] if none)',
    ].join('\n')
  );

  return {
    room: { id: String(roomRow.id), name: roomRow.name, roomType: roomRow.room_type, kind },
    items,
    elsewhere,
    detectionAvailable,
    promptText: lines.join('\n'),
  };
}

const ROOM_FIT_RELATIONS = new Set(['duplicate', 'replacement', 'complement', 'fills_gap', 'unclear']);

/** Validates the model's roomFit field; null if missing or malformed. */
function parseRoomFit(raw, items) {
  const fit = raw && typeof raw === 'object' ? raw.roomFit : null;
  if (!fit || typeof fit !== 'object' || typeof fit.summary !== 'string' || !fit.summary.trim()) return null;
  const known = new Set(items.map((i) => i.name.toLowerCase()));
  // The model may write "tan leather armchair" for the item "Armchair": map it back to the item's name.
  const related = Array.isArray(fit.relatedItems)
    ? fit.relatedItems
        .filter((n) => typeof n === 'string')
        .map((n) => {
          const lower = displayName(n).toLowerCase();
          return [...known].sort((a, b) => b.length - a.length).find((k) => lower === k || lower.includes(k)) || null;
        })
        .filter(Boolean)
        .map((k) => items.find((i) => i.name.toLowerCase() === k).name)
    : [];
  return {
    relation: ROOM_FIT_RELATIONS.has(fit.relation) ? fit.relation : 'unclear',
    summary: fit.summary.trim().slice(0, 600),
    relatedItems: [...new Set(related)].slice(0, 6),
  };
}

module.exports = { buildRoomContext, parseRoomFit, summarizeItems, HIGH_CONFIDENCE };
