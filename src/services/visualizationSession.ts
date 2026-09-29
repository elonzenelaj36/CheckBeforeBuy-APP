/**
 * Visualization session — the TEMPORARY "one room + N products" scene the
 * user is building on the Visualization screen.
 *
 * - Lives in memory only (a module-level store). Nothing here touches the
 *   database, saved rooms/products or history, so abandoned sessions cost
 *   nothing and "start over" can never delete real data.
 * - Screens read it with useVisualizationSession(), so it survives
 *   visualization → check-product (camera) → visualization without
 *   putting images in route params.
 * - `room.imageUri` and every `product.imageUri` are the ORIGINAL images and
 *   are never replaced by the generated one, so regeneration always starts
 *   from originals.
 * - Generation goes through backend POST /generated-images/session,
 *   which calls the existing Cloudflare image-generation service.
 * - Every product also has an editable `transform` (its layer on the room
 *   photo). Moving/resizing/rotating/selecting only changes this local state —
 *   it never calls the generation API. Only regenerateSession() does.
 * - Each product runs one processing pipeline when it joins the session:
 *     original photo → background removal (`cutout`) → 3D model (`model3D`)
 *     → turntable frames rendered on the device.
 *   The layer shows the best representation available: the 3D model's frame
 *   for the product's turn angle, else the transparent cutout, else the
 *   photo. 3D is an enhancement — if it fails, the product stays 2D.
 * - Every pipeline step runs ONCE per product: the backend never generates a
 *   model twice for the same photo, and nothing here re-requests a step that
 *   is in progress or done. A failed step only re-runs on an explicit retry.
 *   Room-image generation (Cloudflare) still uses the ORIGINAL photos.
 */

import React from 'react';

import { File } from 'expo-file-system';

import { apiUploadMultipart } from './api';
import { DEFAULT_ELEVATION_DEG, frameIndexForYaw, loadCachedFrames } from './modelFrames';
import { removeProductBackground, type CutoutQuality } from './productCutouts';
import { captureFovDeg, type CaptureMode, type RoomCapture, type SessionRoomView } from './roomCaptures';
import { blendAt, directionAt, productElevationDeg, projectToFrame } from './roomViewMath';
import { getProductModel, ModelsUnavailableError, requestProductModel, type ProductModel, type ProductModelStage } from './productModels';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_SESSION_PRODUCTS = 8;

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionRoom = {
  id: string;
  name: string;
  roomType: string;
  /** The image products are arranged on: the primary photo, or the captured view in `view`. */
  imageUri: string | null;
  /** Captured 180°/360° view in use ("USE THIS VIEW"); null/absent = the room's primary photo. */
  view?: SessionRoomView | null;
  /** Id of the room's capture, when it has one (lets Arrange offer "Change view"). */
  captureId?: string | null;
  /**
   * Spatial (180°/360°) room: its captured views, loaded once the session
   * starts (setSessionSpatial). Products are then placed by room direction
   * (`transform.anchorDeg`), and `imageUri`/`view` follow the frame the user
   * is looking at — that frame is what Generate uses.
   */
  spatial?: SessionSpatial | null;
};

export type SessionSpatialFrame = {
  id: string;
  angleDeg: number;
  imageUri: string;
  previewUri: string;
  /** How far the camera looked down for this view (null/absent = not recorded → level). */
  pitchDeg?: number | null;
  /** How well it lines up with the next view (0 = snap, see roomViewMath.blendAt). */
  alignScore?: number | null;
};

export type SessionSpatial = {
  captureId: string;
  mode: CaptureMode;
  loops: boolean;
  /** Horizontal field of view of the frames (measured from the capture, else the lens's nominal value). */
  fovDeg: number;
  frames: SessionSpatialFrame[];
  /** Direction the user is looking, settled on a real frame (= room.view.angleDeg). */
  viewDeg: number;
};

/**
 * A product's layer on the room photo, in coordinates normalized to the ROOM
 * IMAGE (0..1), so it renders the same at any screen size.
 */
export type ProductTransform = {
  /** Center of the layer. */
  x: number;
  y: number;
  /** Layer width as a fraction of the room image width; height follows `aspect`. */
  width: number;
  /** Radians. */
  rotation: number;
  /** Product photo width / height (1 until the photo has loaded). */
  aspect: number;
  zIndex: number;
  /** Which way the 3D model faces (degrees, turntable angle). 0 = as photographed. */
  yawDeg: number;
  /** True once the user has moved/resized/rotated it — only then is the position sent to the AI as a hint. */
  placed: boolean;
  /**
   * Spatial rooms only: the room direction (degrees, on the capture's angle
   * scale) the product's centre sits at — where it IS in the room. `x` is
   * then just where that direction appears in the current view. y, width and
   * rotation stay view-relative (the capture is one camera turning in place).
   */
  anchorDeg?: number;
};

export const MIN_LAYER_WIDTH = 0.08;
export const MAX_LAYER_WIDTH = 0.9;

export type SessionCutout =
  | { status: 'pending' }
  | { status: 'ready'; imageUri: string; cutoutId: string; quality: CutoutQuality | null }
  | { status: 'failed'; message: string };

export type SessionModel3D =
  /** Needs the background-removed cutout first. */
  | { status: 'waiting' }
  /** Being generated on the backend; `stage`/`progress` are the provider's real state. */
  | { status: 'generating'; modelId: string | null; stage: ProductModelStage; progress: number | null }
  /** GLB ready; its views are being rendered on this device. */
  /** elevationDeg: the up/down perspective the frames are rendered from (default 15°; spatial rooms: the room's). */
  | { status: 'rendering'; modelId: string; modelUrl: string; elevationDeg?: number }
  | { status: 'ready'; modelId: string; modelUrl: string; frames: string[]; elevationDeg?: number }
  /** `retry` says what "try again" re-runs: the backend generation, or only the on-device render. */
  | {
      status: 'failed';
      message: string;
      retry: 'generate' | 'render';
      modelId: string | null;
      modelUrl: string | null;
      elevationDeg?: number;
      /** 'quota' = the free daily 3D limit is used up (try again tomorrow). */
      reason?: string | null;
    }
  /** No 3D provider configured on the server. */
  | { status: 'unavailable' }
  /** The photo may give an inaccurate model — waiting for the user to continue or keep 2D. Nothing generated yet. */
  | { status: 'review'; warnings: CutoutQuality['warnings'] }
  /** The user chose to keep this product 2D. */
  | { status: 'declined' };

export type SessionProduct = {
  /** Unique within the session (the same product may be added twice). */
  id: string;
  transform: ProductTransform;
  /** Transparent version of the photo (2D layer, and the input for 3D). */
  cutout: SessionCutout;
  /** Generated 3D model (the default layer once ready). */
  model3D: SessionModel3D;
  /** ORIGINAL photo — sent to generation, never replaced by the cutout. */
  imageUri: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  characteristics?: string[];
  /** Existing product check, when the product was analyzed. */
  productCheckId?: string | null;
  /**
   * True when `imageUri` is the product the user outlined in a photo with
   * several/unclear products — it (not the check's full photo) is then what
   * every step uses.
   */
  selectedFromPhoto?: boolean;
};

/**
 * The image a product's layer shows on the Arrange canvas: the 3D model seen
 * from the product's turn angle, else the transparent cutout, else (no cutout
 * yet, or background removal failed) the original photo. RoomComposer draws
 * exactly this, and AI Render rebuilds the same picture from it.
 */
export function layerImageFor(product: SessionProduct): { source: 'frame' | 'cutout' | 'photo'; uri: string } {
  const { cutout, model3D } = product;
  if (model3D.status === 'ready' && model3D.frames.length > 0) {
    return { source: 'frame', uri: model3D.frames[frameIndexForYaw(product.transform.yawDeg, model3D.frames.length)] };
  }
  if (cutout.status === 'ready') return { source: 'cutout', uri: cutout.imageUri };
  return { source: 'photo', uri: product.imageUri };
}

export type SessionGeneration = {
  /** generated_images row id — Save attaches the layout to it. */
  id: string;
  /** The latest generated image. Never used as an input — regeneration always starts from the originals. */
  imageUri: string;
  productsUsed: number;
  generatedAt: string;
};

export type VisualizationSession = {
  id: string;
  room: SessionRoom;
  /** Stable order — this is the order used in the generation prompt. */
  products: SessionProduct[];
  generation: SessionGeneration | null;
  selectedProductId: string | null;
  createdAt: string;
};

export type NewSessionProduct = Omit<SessionProduct, 'id' | 'transform' | 'cutout' | 'model3D'>;

// ── Store ────────────────────────────────────────────────────────────────────

let current: VisualizationSession | null = null;
const listeners = new Set<() => void>();
let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function commit(next: VisualizationSession | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSession(): VisualizationSession | null {
  if (current && Date.now() - new Date(current.createdAt).getTime() > SESSION_TTL_MS) {
    commit(null); // expired
  }
  return current;
}

/** Re-renders when the session changes. null = no (or an expired) session. */
export function useVisualizationSession(): VisualizationSession | null {
  return React.useSyncExternalStore(subscribe, getSession, getSession);
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** New layers are staggered across the lower middle of the room so they don't stack exactly. */
function defaultTransform(index: number, zIndex: number): ProductTransform {
  const column = index % 3;
  const row = Math.floor(index / 3) % 2;
  return {
    x: 0.3 + column * 0.2,
    y: 0.58 + row * 0.16,
    width: 0.3,
    rotation: 0,
    aspect: 1,
    zIndex,
    yawDeg: 0,
    placed: false,
  };
}

function topZIndex(products: SessionProduct[]): number {
  return products.reduce((max, p) => Math.max(max, p.transform.zIndex), 0);
}

export function startSession(room: SessionRoom, firstProduct?: NewSessionProduct): VisualizationSession {
  const first: SessionProduct | null = firstProduct
    ? {
        ...firstProduct,
        id: nextId('product'),
        transform: defaultTransform(0, 1),
        cutout: { status: 'pending' },
        model3D: { status: 'waiting' },
      }
    : null;
  const session: VisualizationSession = {
    id: nextId('session'),
    room,
    products: first ? [first] : [],
    generation: null,
    selectedProductId: first?.id ?? null,
    createdAt: new Date().toISOString(),
  };
  stopAllModelPolling();
  commit(session);
  if (first) void prepareCutout(first.id);
  return session;
}

export type AddProductResult =
  | { ok: true; product: SessionProduct }
  | { ok: false; reason: 'no-session' | 'invalid-image' | 'limit-reached'; message: string };

/** Original file is checked for existence, but the product is only stored, never re-encoded. */
export function addProduct(input: NewSessionProduct): AddProductResult {
  const session = getSession();
  if (!session) {
    return {
      ok: false,
      reason: 'no-session',
      message: 'This visualization session has expired. Please start again from your room.',
    };
  }
  if (!input.imageUri || !isUsableImage(input.imageUri)) {
    return { ok: false, reason: 'invalid-image', message: "We couldn't read that photo. Please try another one." };
  }
  if (session.products.length >= MAX_SESSION_PRODUCTS) {
    return {
      ok: false,
      reason: 'limit-reached',
      message: `You can place up to ${MAX_SESSION_PRODUCTS} products in one room.`,
    };
  }

  const transform = defaultTransform(session.products.length, topZIndex(session.products) + 1);
  const spatial = session.room.spatial;
  if (spatial) transform.anchorDeg = directionAt(transform.x, spatial.viewDeg, spatial.fovDeg);
  const product: SessionProduct = {
    ...input,
    id: nextId('product'),
    name: input.name.trim() || `Product ${session.products.length + 1}`,
    transform,
    cutout: { status: 'pending' },
    model3D: { status: 'waiting' },
  };
  // The new product is selected so the user can position it right away.
  commit({ ...session, products: [...session.products, product], selectedProductId: product.id });
  void prepareCutout(product.id);
  return { ok: true, product };
}

/**
 * Switches the room image to a captured view (or back to the primary photo
 * with view = null). Product layers keep their positions (they are
 * normalized to the image), and the last AI Render is dropped because it
 * was made on the previous view. Local only.
 */
export function setSessionRoomView(imageUri: string | null, view: SessionRoomView | null) {
  const session = getSession();
  if (!session) return;
  if (session.room.spatial && view && view.captureId === session.room.spatial.captureId) {
    setSessionViewAngle(view.angleDeg);
    return;
  }
  commit({ ...session, room: { ...session.room, imageUri, view }, generation: null });
}

/**
 * Up/down perspective to render a 3D product from so it matches the room:
 * spatial rooms — the angle the room's camera sees the product's position at
 * (view pitch + position below the image centre, see productElevationDeg);
 * photo rooms — the default (no camera information), as before.
 */
function elevationFor(session: VisualizationSession, product: SessionProduct): number {
  const spatial = session.room.spatial;
  if (!spatial) return DEFAULT_ELEVATION_DEG;
  return spatialElevation(spatial, frameAt(spatial, spatial.viewDeg), product.transform.y);
}

function spatialElevation(spatial: SessionSpatial, frame: SessionSpatialFrame, y: number): number {
  return productElevationDeg(y, frame.pitchDeg ?? 0, spatial.fovDeg);
}

/** The captured frame nearest a direction (the view that is actually shown / generated). */
function frameAt(spatial: SessionSpatial, angleDeg: number): SessionSpatialFrame {
  return spatial.frames[blendAt(spatial.frames, spatial.loops, angleDeg).nearest];
}

/** Products re-projected into the frame at `frameDeg` (x follows each product's room direction). */
function projectProducts(products: SessionProduct[], spatial: SessionSpatial, frameDeg: number): SessionProduct[] {
  return products.map((p) =>
    p.transform.anchorDeg == null
      ? p
      : {
          ...p,
          transform: {
            ...p.transform,
            x: projectToFrame(p.transform.anchorDeg, frameDeg, spatial.fovDeg, spatial.loops),
          },
        }
  );
}

/**
 * Turns the session into a spatial one with the room's captured views. The
 * view starts on the one in use (the session's, else the room's selected
 * view, else the middle), and products already in the session get a room
 * direction from where they are on screen. Local only.
 */
export function setSessionSpatial(capture: RoomCapture) {
  const session = getSession();
  if (!session || session.room.spatial || capture.frames.length === 0) return;
  const frames = capture.frames.map(({ id, angleDeg, imageUri, previewUri, pitchDeg, alignScore }) => ({
    id,
    angleDeg,
    imageUri,
    previewUri,
    pitchDeg: pitchDeg ?? null,
    alignScore: alignScore ?? null,
  }));
  const start =
    frames.find((f) => f.id === session.room.view?.frameId) ??
    frames.find((f) => f.id === capture.selectedView?.frameId) ??
    frames[Math.floor(frames.length / 2)];
  const spatial: SessionSpatial = {
    captureId: capture.id,
    mode: capture.mode,
    loops: capture.loops,
    fovDeg: captureFovDeg(capture),
    frames,
    viewDeg: start.angleDeg,
  };
  const products = session.products.map((p) => {
    const placed =
      p.transform.anchorDeg != null
        ? p
        : { ...p, transform: { ...p.transform, anchorDeg: directionAt(p.transform.x, start.angleDeg, spatial.fovDeg) } };
    // A 3D view drawn before the room's views arrived is re-drawn from the room's perspective.
    const m = placed.model3D;
    if (m.status !== 'ready' && m.status !== 'rendering') return placed;
    const elevationDeg = spatialElevation(spatial, start, placed.transform.y);
    if ((m.elevationDeg ?? DEFAULT_ELEVATION_DEG) === elevationDeg) return placed;
    return { ...placed, model3D: { status: 'rendering' as const, modelId: m.modelId, modelUrl: m.modelUrl, elevationDeg } };
  });
  commit({
    ...session,
    room: {
      ...session.room,
      spatial,
      captureId: capture.id,
      imageUri: start.imageUri,
      view: { captureId: capture.id, frameId: start.id, angleDeg: start.angleDeg, mode: capture.mode },
    },
    products: projectProducts(products, spatial, start.angleDeg),
  });
}

/**
 * The user settled on a direction in a spatial room: that frame becomes the
 * room image (what Generate uses) and every product's on-screen x is
 * re-projected from its room direction. Products keep their room position;
 * the previous AI render stays viewable. Local only.
 */
export function setSessionViewAngle(angleDeg: number) {
  const session = getSession();
  const spatial = session?.room.spatial;
  if (!session || !spatial) return;
  const frame = frameAt(spatial, angleDeg);
  if (frame.angleDeg === spatial.viewDeg && session.room.view?.frameId === frame.id) return;
  commit({
    ...session,
    room: {
      ...session.room,
      imageUri: frame.imageUri,
      view: { captureId: spatial.captureId, frameId: frame.id, angleDeg: frame.angleDeg, mode: spatial.mode },
      spatial: { ...spatial, viewDeg: frame.angleDeg },
    },
    products: projectProducts(session.products, spatial, frame.angleDeg),
  });
}

/**
 * Products that appear in the current view (their box overlaps the frame).
 * In a spatial room the others are elsewhere in the room — not in this
 * picture, so they are not sent to Generate. Photo rooms: all products.
 */
export function productsInView(session: VisualizationSession): SessionProduct[] {
  if (!session.room.spatial) return session.products;
  return session.products.filter((p) => Math.abs(p.transform.x - 0.5) < 0.5 + p.transform.width / 2);
}

/** Removes from THIS session only — saved products/history are untouched. */
export function removeProduct(productId: string) {
  const session = getSession();
  if (!session) return;
  stopModelPolling(productId);
  commit({
    ...session,
    products: session.products.filter((p) => p.id !== productId),
    selectedProductId: session.selectedProductId === productId ? null : session.selectedProductId,
  });
}

/** Selects a layer and brings it to the front. null deselects. Local only. */
export function selectProduct(productId: string | null) {
  const session = getSession();
  if (!session || session.selectedProductId === productId) return;
  const top = topZIndex(session.products);
  commit({
    ...session,
    selectedProductId: productId,
    products: session.products.map((p) =>
      p.id === productId && p.transform.zIndex < top ? { ...p, transform: { ...p.transform, zIndex: top + 1 } } : p
    ),
  });
}

/**
 * Stores a layer's transform. Called once at the END of a gesture (never per
 * frame) and when a product photo reports its aspect ratio. Local only.
 */
export function updateProductTransform(productId: string, patch: Partial<ProductTransform>) {
  const session = getSession();
  if (!session) return;
  // Spatial room: a new on-screen x means a new place in the room (unless the caller already worked it out).
  const spatial = session.room.spatial;
  if (spatial && patch.x !== undefined && patch.anchorDeg === undefined) {
    patch = { ...patch, anchorDeg: directionAt(patch.x, spatial.viewDeg, spatial.fovDeg) };
  }
  commit({
    ...session,
    products: session.products.map((p) =>
      p.id === productId ? { ...p, transform: { ...p.transform, ...patch } } : p
    ),
  });
}

function patchProduct(sessionId: string, productId: string, patch: (p: SessionProduct) => SessionProduct) {
  const session = getSession();
  if (!session || session.id !== sessionId) return; // started over meanwhile
  commit({ ...session, products: session.products.map((p) => (p.id === productId ? patch(p) : p)) });
}

/**
 * Removes the background of a product's ORIGINAL photo so its layer is a
 * clean cutout. Runs once per product (the result is cached per photo); a
 * failure only marks the product — the session and other products are kept,
 * and the user can retry with retryCutout().
 */
async function prepareCutout(productId: string) {
  const session = getSession();
  const product = session?.products.find((p) => p.id === productId);
  if (!session || !product || product.cutout.status === 'ready') return;

  patchProduct(session.id, productId, (p) => ({ ...p, cutout: { status: 'pending' } }));
  try {
    const cutout = await removeProductBackground({ imageUri: product.imageUri, productCheckId: product.productCheckId });
    patchProduct(session.id, productId, (p) => ({
      ...p,
      cutout: { status: 'ready', imageUri: cutout.imageUri, cutoutId: cutout.id, quality: cutout.quality },
      transform: { ...p.transform, aspect: cutout.width / cutout.height },
    }));
    void startModel3D(productId);
  } catch (error: any) {
    if (__DEV__) console.warn('[visualization] background removal failed:', error?.message ?? error);
    patchProduct(session.id, productId, (p) => ({
      ...p,
      cutout: {
        status: 'failed',
        message: error?.message || "We couldn't remove the product background. Please try again.",
      },
    }));
  }
}

/** User-requested retry after a failed background removal. */
export function retryCutout(productId: string) {
  void prepareCutout(productId);
}

// ── 3D model ─────────────────────────────────────────────────────────────────

const MODEL_POLL_MS = 3000;
const MAX_POLL_ERRORS = 10;
const modelRequests = new Set<string>();
const modelPollers = new Map<string, ReturnType<typeof setTimeout>>();

function stopModelPolling(productId: string) {
  const timer = modelPollers.get(productId);
  if (timer) clearTimeout(timer);
  modelPollers.delete(productId);
}

function stopAllModelPolling() {
  modelPollers.forEach((timer) => clearTimeout(timer));
  modelPollers.clear();
}

function setModel3D(sessionId: string, productId: string, model3D: SessionModel3D) {
  patchProduct(sessionId, productId, (p) => ({ ...p, model3D }));
}

/** Applies the backend's model state; returns true while it is still generating. */
function applyModel(sessionId: string, productId: string, model: ProductModel): boolean {
  if (model.status === 'ready' && model.modelUrl) {
    // Chosen automatically from the room's perspective (the user only turns it left/right).
    const session = getSession();
    const product = session?.products.find((p) => p.id === productId);
    const elevationDeg = session && product ? elevationFor(session, product) : DEFAULT_ELEVATION_DEG;
    const cached = loadCachedFrames(model.modelUrl, elevationDeg);
    if (cached) {
      applyFrames(sessionId, productId, model.id, model.modelUrl, cached.frames, cached.aspect, elevationDeg);
    } else {
      setModel3D(sessionId, productId, { status: 'rendering', modelId: model.id, modelUrl: model.modelUrl, elevationDeg });
    }
    return false;
  }
  if (model.status === 'failed') {
    setModel3D(sessionId, productId, {
      status: 'failed',
      message: model.message || "3D preview couldn't be created.",
      retry: 'generate',
      modelId: model.id,
      modelUrl: null,
      reason: model.reason ?? null,
    });
    return false;
  }
  setModel3D(sessionId, productId, {
    status: 'generating',
    modelId: model.id,
    stage: model.stage ?? 'starting',
    progress: model.progress,
  });
  return true;
}

function schedulePoll(sessionId: string, productId: string, modelId: string, errors = 0) {
  stopModelPolling(productId);
  const timer = setTimeout(async () => {
    modelPollers.delete(productId);
    const product = getSession()?.products.find((p) => p.id === productId);
    if (getSession()?.id !== sessionId || product?.model3D.status !== 'generating') return;
    try {
      const model = await getProductModel(modelId);
      if (applyModel(sessionId, productId, model)) schedulePoll(sessionId, productId, modelId);
    } catch (error: any) {
      // Network hiccups: keep waiting; polling never starts a new generation.
      if (errors + 1 < MAX_POLL_ERRORS) {
        schedulePoll(sessionId, productId, modelId, errors + 1);
      } else {
        setModel3D(sessionId, productId, {
          status: 'failed',
          message: error?.message || "Couldn't reach the server.",
          retry: 'generate',
          modelId,
          modelUrl: null,
        });
      }
    }
  }, errors === 0 ? MODEL_POLL_MS : MODEL_POLL_MS * 2);
  modelPollers.set(productId, timer);
}

/**
 * Asks the backend for this product's 3D model. The backend starts a
 * generation only if this photo was never generated before; otherwise it
 * returns the existing model. `retry` is only for an explicit user retry.
 */
async function startModel3D(productId: string, retry = false, reviewed = false) {
  const session = getSession();
  const product = session?.products.find((p) => p.id === productId);
  if (!session || !product || product.cutout.status !== 'ready') return;
  const allowed = retry
    ? product.model3D.status === 'failed'
    : product.model3D.status === 'waiting' || (reviewed && product.model3D.status === 'review');
  if (!allowed || modelRequests.has(productId)) return;

  // A photo that may give an inaccurate model: ask before generating anything.
  const quality = product.cutout.quality;
  if (!retry && !reviewed && quality && !quality.ok) {
    setModel3D(session.id, productId, { status: 'review', warnings: quality.warnings });
    return;
  }

  modelRequests.add(productId);
  setModel3D(session.id, productId, { status: 'generating', modelId: null, stage: 'starting', progress: null });
  try {
    const model = await requestProductModel(product.cutout.cutoutId, { retry });
    if (applyModel(session.id, productId, model)) schedulePoll(session.id, productId, model.id);
  } catch (error: any) {
    if (error instanceof ModelsUnavailableError) {
      if (__DEV__) console.warn('[visualization] 3D unavailable:', error.message);
      setModel3D(session.id, productId, { status: 'unavailable' });
    } else {
      setModel3D(session.id, productId, {
        status: 'failed',
        message: error?.message || "3D preview couldn't be created.",
        retry: 'generate',
        modelId: null,
        modelUrl: null,
      });
    }
  } finally {
    modelRequests.delete(productId);
  }
}

function applyFrames(
  sessionId: string,
  productId: string,
  modelId: string,
  modelUrl: string,
  frames: string[],
  aspect: number,
  elevationDeg?: number
) {
  patchProduct(sessionId, productId, (p) => {
    // Keep the product's on-screen HEIGHT when switching to the 3D view, so it
    // doesn't jump in size (the 3D frame box has a different aspect).
    const width = Math.min(MAX_LAYER_WIDTH, Math.max(MIN_LAYER_WIDTH, (p.transform.width / p.transform.aspect) * aspect));
    return {
      ...p,
      model3D: { status: 'ready', modelId, modelUrl, frames, elevationDeg },
      transform: { ...p.transform, aspect, width },
    };
  });
}

/** Called by the on-device renderer when a model's frames are ready. */
export function setModelFrames(productId: string, frames: string[], aspect: number) {
  const session = getSession();
  const product = session?.products.find((p) => p.id === productId);
  if (!session || product?.model3D.status !== 'rendering') return;
  const m = product.model3D;
  applyFrames(session.id, productId, m.modelId, m.modelUrl, frames, aspect, m.elevationDeg);
}

/** Called by the on-device renderer when the model couldn't be displayed. */
export function setModelRenderFailed(productId: string, message: string) {
  const session = getSession();
  const product = session?.products.find((p) => p.id === productId);
  if (!session || product?.model3D.status !== 'rendering') return;
  if (__DEV__) console.warn('[visualization] 3D render failed:', message);
  setModel3D(session.id, productId, {
    status: 'failed',
    message: "3D preview couldn't be shown on this device.",
    retry: 'render',
    modelId: product.model3D.modelId,
    modelUrl: product.model3D.modelUrl,
    elevationDeg: product.model3D.elevationDeg,
  });
}

/** User chose to create the 3D model despite the photo-quality warnings. */
export function confirmModel3D(productId: string) {
  void startModel3D(productId, false, true);
}

/** User chose to keep this product 2D (no 3D generation). */
export function declineModel3D(productId: string) {
  const session = getSession();
  const product = session?.products.find((p) => p.id === productId);
  if (session && product?.model3D.status === 'review') setModel3D(session.id, productId, { status: 'declined' });
}

/** Explicit user retry after a 3D failure. A render failure only re-renders locally. */
export function retryModel3D(productId: string) {
  const session = getSession();
  const product = session?.products.find((p) => p.id === productId);
  if (!session || product?.model3D.status !== 'failed') return;
  const failed = product.model3D;
  if (failed.retry === 'render' && failed.modelId && failed.modelUrl) {
    setModel3D(session.id, productId, {
      status: 'rendering',
      modelId: failed.modelId,
      modelUrl: failed.modelUrl,
      elevationDeg: failed.elevationDeg,
    });
  } else {
    void startModel3D(productId, true);
  }
}

/** Clears the temporary session only. Saved rooms/products/history are untouched. */
export function clearSession() {
  stopAllModelPolling();
  commit(null);
}

function isUsableImage(uri: string): boolean {
  if (uri.startsWith('file://')) {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  }
  return /^https?:\/\//.test(uri);
}

// ── Generation ────────────────────────────────────────────────────────

/** What the generation service receives: ORIGINAL images, array of products. */
export type GenerationPayload = {
  roomImage: string | null;
  roomType: string;
  products: {
    image: string;
    name: string;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    characteristics?: string[];
    /** Only for layers the user arranged: where it should go (normalized to the room image). */
    placement?: { x: number; y: number; width: number };
    /** The product's layer exactly as shown in Arrange — AI Render's spatial reference. */
    layer: GenerationLayer;
  }[];
};

export type GenerationLayer = {
  x: number;
  y: number;
  width: number;
  rotation: number;
  aspect: number;
  zIndex: number;
  source: 'frame' | 'cutout' | 'photo';
  /** Backend cutout the layer shows (source 'cutout'); also the product's appearance reference. */
  cutoutId?: string;
};

/** Spatial rooms: only the products in the current view are part of this picture (see productsInView). */
export function buildGenerationPayload(session: VisualizationSession): GenerationPayload {
  return {
    roomImage: session.room.imageUri,
    roomType: session.room.roomType,
    products: productsInView(session).map((p) => ({
      image: p.imageUri,
      name: p.name,
      category: p.category,
      brand: p.brand,
      model: p.model,
      characteristics: p.characteristics,
      ...(p.transform.placed
        ? { placement: { x: round3(p.transform.x), y: round3(p.transform.y), width: round3(p.transform.width) } }
        : {}),
      layer: {
        x: round4(p.transform.x),
        y: round4(p.transform.y),
        width: round4(p.transform.width),
        rotation: round4(p.transform.rotation),
        aspect: round4(p.transform.aspect),
        zIndex: p.transform.zIndex,
        source: layerImageFor(p).source,
        ...(p.cutout.status === 'ready' ? { cutoutId: p.cutout.cutoutId } : {}),
      },
    })),
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** What Save stores with the generated image: enough to understand/rebuild the composition. */
export function buildLayout(session: VisualizationSession) {
  return {
    version: 1,
    sessionId: session.id,
    room: {
      id: session.room.id,
      name: session.room.name,
      roomType: session.room.roomType,
      // Which captured viewpoint the layout was arranged on (null = primary photo).
      view: session.room.view ?? null,
    },
    products: session.products.map((p) => ({
      name: p.name,
      category: p.category ?? null,
      brand: p.brand ?? null,
      productCheckId: p.productCheckId ?? null,
      cutoutImageUri: p.cutout.status === 'ready' ? p.cutout.imageUri : null,
      model3D: p.model3D.status === 'ready' ? { id: p.model3D.modelId, modelUrl: p.model3D.modelUrl } : null,
      transform: {
        x: round3(p.transform.x),
        y: round3(p.transform.y),
        width: round3(p.transform.width),
        rotation: round3(p.transform.rotation),
        aspect: round3(p.transform.aspect),
        zIndex: p.transform.zIndex,
        yawDeg: Math.round(p.transform.yawDeg),
        // Spatial rooms: where the product is in the room (capture angle), independent of the view.
        ...(p.transform.anchorDeg != null ? { anchorDeg: round3(p.transform.anchorDeg) } : {}),
      },
    })),
    generatedAt: session.generation?.generatedAt ?? null,
    savedAt: new Date().toISOString(),
  };
}

export type RegenerateResult = { ok: true } | { ok: false; message: string };

/**
 * Validates the session, logs the payload,
 * uploads the original photos to the backend, which calls the Cloudflare service, and stores the result.
 */
export async function regenerateSession(): Promise<RegenerateResult> {
  const session = getSession();
  if (!session) return { ok: false, message: 'This visualization session has expired. Please start again.' };
  if (!session.room.id) return { ok: false, message: 'No room is selected for this visualization.' };
  if (session.products.length === 0) return { ok: false, message: 'Add at least one product first.' };
  // Spatial room: the picture is the current view, so only the products in it are sent.
  const sent = productsInView(session);
  if (sent.length === 0) {
    return { ok: false, message: 'None of your products are in this view. Swipe the room to where they are.' };
  }

  const payload = buildGenerationPayload(session);
  if (__DEV__) {
    console.log(`[visualization] generating: room + ${payload.products.length} product(s)`, JSON.stringify(payload, null, 2));
  }

  try {
    // Only ORIGINAL local photos are uploaded (file://). Products that were
    // already analyzed have a saved photo on the backend, referenced by
    // productCheckId. The room's saved primary photo is used server-side,
    // or the captured view (roomViewId) when the user picked one.
    const images: Record<string, string> = {};
    sent.forEach((p, i) => {
      if (p.imageUri.startsWith('file://') && (!p.productCheckId || p.selectedFromPhoto)) {
        images[`productImage${i}`] = p.imageUri;
      }
      // A 3D view exists only on this device — upload the exact frame the layer shows.
      const layerImage = layerImageFor(p);
      if (layerImage.source === 'frame') images[`layerImage${i}`] = layerImage.uri;
    });

    const response = await apiUploadMultipart<{
      success: boolean;
      status?: 'pending' | 'completed' | 'failed';
      id: string;
      generatedImage: string | null;
      productsUsed: number;
      message?: string | null;
    }>('/generated-images/session', images, {
      roomId: session.room.id,
      ...(session.room.view ? { roomViewId: session.room.view.frameId } : {}),
      products: JSON.stringify(
        payload.products.map(({ image: _image, ...meta }, i) => ({
          ...meta,
          ...(sent[i].productCheckId ? { productCheckId: sent[i].productCheckId } : {}),
        }))
      ),
    });

    // The user may have started over / edited while we waited.
    const latest = getSession();
    if (!latest || latest.id !== session.id) return { ok: false, message: 'The session changed. Please try again.' };

    if (response.status !== 'completed' || !response.generatedImage) {
      return {
        ok: false,
        message:
          response.message ||
          (response.status === 'pending'
            ? 'Image generation is not configured on the server yet.'
            : "Couldn't generate the visualization. Please try again."),
      };
    }

    commit({
      ...latest,
      generation: {
        id: response.id,
        imageUri: response.generatedImage,
        productsUsed: response.productsUsed,
        generatedAt: new Date().toISOString(),
      },
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? "Couldn't generate the visualization. Please try again." };
  }
}
