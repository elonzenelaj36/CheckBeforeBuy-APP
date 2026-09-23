/**
 * Renders a product's GLB into turntable frames, once per model per device.
 *
 * Mounted (invisible) by the Visualization screen for ONE product at a time
 * whose model3D is 'rendering'. Frames are written to the cache
 * (services/modelFrames.ts), so the next time — or after navigating away and
 * back — they load instantly and no WebView is needed.
 */

import React from 'react';

import { StyleSheet } from 'react-native';

import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildModelViewerHtml } from '@/components/model3d/modelViewerHtml';
import { loadCachedFrames, MAX_FRAME_SIZE, saveFrame, saveManifest, TURNTABLE_FRAMES } from '@/services/modelFrames';

const RENDER_TIMEOUT_MS = 120000;

type Props = {
  productId: string;
  modelUrl: string;
  onDone: (productId: string, frames: string[], aspect: number) => void;
  onError: (productId: string, message: string) => void;
};

/** Origin of the model URL — the page is loaded from it so the GLB fetch is same-origin. */
export function originOf(url: string): string {
  return url.match(/^https?:\/\/[^/]+/i)?.[0] ?? 'about:blank';
}

export default function TurntableRenderer({ productId, modelUrl, onDone, onError }: Props) {
  const cached = React.useMemo(() => loadCachedFrames(modelUrl), [modelUrl]);
  const frames = React.useRef<string[]>([]);
  const settled = React.useRef(false);

  const finish = React.useCallback(
    (result: { frames: string[]; aspect: number } | { error: string }) => {
      if (settled.current) return;
      settled.current = true;
      if ('error' in result) onError(productId, result.error);
      else onDone(productId, result.frames, result.aspect);
    },
    [productId, onDone, onError]
  );

  React.useEffect(() => {
    if (cached) {
      finish(cached);
      return;
    }
    const timer = setTimeout(() => finish({ error: 'Rendering the 3D model timed out.' }), RENDER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cached, finish]);

  const source = React.useMemo(
    () => ({
      html: buildModelViewerHtml({ mode: 'turntable', modelUrl, frames: TURNTABLE_FRAMES, maxFrameSize: MAX_FRAME_SIZE }),
      baseUrl: originOf(modelUrl),
    }),
    [modelUrl]
  );

  if (cached) return null;

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: any;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    try {
      if (message.type === 'frame') {
        frames.current[message.index] = saveFrame(modelUrl, message.index, message.base64);
      } else if (message.type === 'done') {
        const all = frames.current.slice(0, message.frames);
        if (all.length !== message.frames || all.some((f) => !f)) throw new Error('Some 3D views are missing.');
        finish(saveManifest(modelUrl, all, message.width / message.height));
      } else if (message.type === 'error') {
        finish({ error: String(message.message) });
      }
    } catch (error: any) {
      finish({ error: error?.message ?? 'Could not save the 3D views.' });
    }
  };

  return (
    <WebView
      pointerEvents="none"
      style={styles.hidden}
      containerStyle={styles.hidden}
      source={source}
      originWhitelist={['*']}
      javaScriptEnabled
      mixedContentMode="always"
      androidLayerType="hardware"
      onMessage={handleMessage}
      onError={(e) => finish({ error: e.nativeEvent.description || 'The 3D renderer failed to load.' })}
      onContentProcessDidTerminate={() => finish({ error: 'The 3D renderer stopped.' })}
      onRenderProcessGone={() => finish({ error: 'The 3D renderer stopped.' })}
      webviewDebuggingEnabled={__DEV__}
    />
  );
}

const styles = StyleSheet.create({
  // Must be laid out with a real size for WebGL to render, but not seen.
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 220,
    height: 220,
    opacity: 0.01,
    backgroundColor: 'transparent',
  },
});
