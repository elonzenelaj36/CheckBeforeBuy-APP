/**
 * HTML for the WebView that renders a product's GLB with Google's
 * <model-viewer> (WebGL). Pure string builder — no React Native imports — so
 * the exact same page can be tested in a desktop browser.
 *
 * Two modes:
 *  - 'turntable': renders the model from `frames` evenly spaced angles on a
 *    transparent background, crops every frame to ONE shared box (so the
 *    product keeps the same scale while it turns) and posts each frame as a
 *    PNG. These frames are the product's layer in the room.
 *  - 'viewer': interactive orbit/zoom view of the model.
 *
 * Messages posted to React Native (JSON strings):
 *   { type: 'loaded' }
 *   { type: 'frame', index, base64, width, height }   (turntable)
 *   { type: 'done', frames, width, height, frontIndex }  (turntable)
 *
 * Turntable with `referenceUrl` (the product's cutout photo): the frame that
 * looks most like the photo is reported as `frontIndex` — 3D generators don't
 * always put the photographed side at angle 0 (a painting's picture can be
 * on the back). Without a reference: frontIndex 0.
 *   { type: 'orbit', yawDeg }                          (viewer, after the user turns it)
 *   { type: 'error', message }
 */

export const MODEL_VIEWER_VERSION = '4.3.1';

/** Default camera elevation used for room layers: slightly above, like a phone photo of a room. */
export const TURNTABLE_ELEVATION_DEG = 15;

/** elevationDeg: camera height angle over the product (default TURNTABLE_ELEVATION_DEG). */
export type ModelViewerHtmlOptions =
  | {
      mode: 'turntable';
      modelUrl: string;
      frames: number;
      maxFrameSize: number;
      elevationDeg?: number;
      referenceUrl?: string | null;
    }
  | { mode: 'viewer'; modelUrl: string; initialYawDeg: number; elevationDeg?: number };

export function buildModelViewerHtml(options: ModelViewerHtmlOptions): string {
  const config = JSON.stringify({ ...options, elevationDeg: options.elevationDeg ?? TURNTABLE_ELEVATION_DEG });
  const interactive = options.mode === 'viewer';

  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@${MODEL_VIEWER_VERSION}/dist/model-viewer.min.js"></script>
<style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  model-viewer { width: 100vw; height: 100vh; background: transparent; --poster-color: transparent; --progress-bar-height: 0; }
</style>
</head>
<body>
<model-viewer
  id="mv"
  src=""
  environment-image="neutral"
  shadow-intensity="1"
  shadow-softness="0.8"
  exposure="1"
  field-of-view="30deg"
  interaction-prompt="none"
  ${interactive ? 'camera-controls touch-action="none"' : 'disable-zoom disable-pan'}
></model-viewer>
<script>
(function () {
  var config = ${config};
  var post = function (message) {
    var text = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.__onModelViewerMessage) window.__onModelViewerMessage(message);
  };
  window.onerror = function (message) { post({ type: 'error', message: String(message) }); };

  var mv = document.getElementById('mv');
  var pitch = 90 - config.elevationDeg;

  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

  async function settle() {
    mv.jumpCameraToGoal();
    await nextFrame(); await nextFrame(); await nextFrame();
  }

  // Bounding box of non-transparent pixels, or null if the image is empty.
  function alphaBox(canvas) {
    var ctx = canvas.getContext('2d');
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (var y = 0; y < canvas.height; y++) {
      for (var x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('frame decode failed')); };
      img.src = src;
    });
  }

  async function renderTurntable() {
    var captures = [];
    var union = null;
    for (var i = 0; i < config.frames; i++) {
      var yaw = (i * 360) / config.frames;
      mv.cameraOrbit = yaw + 'deg ' + pitch + 'deg auto';
      await settle();
      var img = await loadImage(mv.toDataURL('image/png'));
      var canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      var box = alphaBox(canvas);
      if (box) {
        union = union
          ? (function (a, b) {
              var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
              return { x: x, y: y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
            })(union, box)
          : box;
      }
      captures.push(canvas);
    }
    if (!union) throw new Error('The 3D model rendered empty.');

    var pad = 2;
    var sx = Math.max(0, union.x - pad), sy = Math.max(0, union.y - pad);
    var sw = Math.min(captures[0].width - sx, union.w + pad * 2), sh = Math.min(captures[0].height - sy, union.h + pad * 2);
    var scale = Math.min(1, config.maxFrameSize / Math.max(sw, sh));
    var ow = Math.max(1, Math.round(sw * scale)), oh = Math.max(1, Math.round(sh * scale));

    for (var j = 0; j < captures.length; j++) {
      var out = document.createElement('canvas');
      out.width = ow; out.height = oh;
      out.getContext('2d').drawImage(captures[j], sx, sy, sw, sh, 0, 0, ow, oh);
      post({ type: 'frame', index: j, base64: out.toDataURL('image/png').split(',')[1], width: ow, height: oh });
      await nextFrame(); // let the bridge breathe between frames
    }
    var frontIndex = 0;
    try {
      frontIndex = await findFront(captures);
    } catch (e) {
      // the reference couldn't be read: frame 0, as before
    }
    post({ type: 'done', frames: captures.length, width: ow, height: oh, frontIndex: frontIndex });
  }

  var SIG = 24;
  // A small signature of an image's visible part: alpha + colour, cropped to its own box.
  function signature(source, box) {
    var c = document.createElement('canvas');
    c.width = SIG; c.height = SIG;
    var ctx = c.getContext('2d');
    ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, SIG, SIG);
    return ctx.getImageData(0, 0, SIG, SIG).data;
  }

  // Outline overlap + correlation of the brightness pattern inside it (the outer 15% — a frame's border —
  // left out). The pattern tells the photographed side from the mirrored texture seen from behind.
  function similarity(a, b) {
    var inter = 0, union = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    var m = Math.round(SIG * 0.15);
    for (var y = 0; y < SIG; y++) {
      for (var x = 0; x < SIG; x++) {
        var i = (y * SIG + x) * 4;
        var ia = a[i + 3] > 128, ib = b[i + 3] > 128;
        if (ia && ib) inter++;
        if (ia || ib) union++;
        if (!ia || !ib || x < m || y < m || x >= SIG - m || y >= SIG - m) continue;
        var la = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
        var lb = 0.3 * b[i] + 0.59 * b[i + 1] + 0.11 * b[i + 2];
        n++; sx += la; sy += lb; sxx += la * la; syy += lb * lb; sxy += la * lb;
      }
    }
    var ncc = 0;
    if (n > 8) {
      var vx = sxx / n - (sx / n) * (sx / n), vy = syy / n - (sy / n) * (sy / n);
      if (vx > 1e-6 && vy > 1e-6) ncc = (sxy / n - (sx / n) * (sy / n)) / Math.sqrt(vx * vy);
    }
    return 0.3 * (union ? inter / union : 0) + 0.7 * ncc;
  }

  async function findFront(captures) {
    if (!config.referenceUrl) return 0;
    var ref = await new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('reference failed')); };
      img.src = config.referenceUrl;
    });
    var rc = document.createElement('canvas');
    rc.width = ref.width; rc.height = ref.height;
    rc.getContext('2d').drawImage(ref, 0, 0);
    var rbox = alphaBox(rc);
    if (!rbox) return 0;
    var refSig = signature(rc, rbox);
    var best = 0, bestScore = -1;
    for (var i = 0; i < captures.length; i++) {
      var box = alphaBox(captures[i]);
      if (!box) continue;
      // The photo's proportions matter too: a side view of a painting is a sliver.
      var shape = Math.min(box.w / box.h, rbox.w / rbox.h) / Math.max(box.w / box.h, rbox.w / rbox.h);
      var score = similarity(signature(captures[i], box), refSig) * (0.5 + 0.5 * shape);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  mv.addEventListener('error', function (event) {
    var detail = event && event.detail && event.detail.sourceError;
    post({ type: 'error', message: 'Could not load the 3D model' + (detail ? ': ' + detail.message : '') });
  });

  mv.addEventListener('load', async function () {
    post({ type: 'loaded' });
    try {
      if (config.mode === 'turntable') {
        await renderTurntable();
      } else {
        mv.cameraOrbit = config.initialYawDeg + 'deg ' + pitch + 'deg auto';
        mv.jumpCameraToGoal();
        mv.addEventListener('camera-change', function (event) {
          if (!event.detail || event.detail.source !== 'user-interaction') return;
          var theta = mv.getCameraOrbit().theta * 180 / Math.PI;
          post({ type: 'orbit', yawDeg: ((theta % 360) + 360) % 360 });
        });
      }
    } catch (error) {
      post({ type: 'error', message: String(error && error.message || error) });
    }
  });

  customElements.whenDefined('model-viewer').then(function () { mv.src = config.modelUrl; });
})();
</script>
</body>
</html>`;
}
