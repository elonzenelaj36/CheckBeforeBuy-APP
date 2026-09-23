/**
 * Full-screen interactive 3D view of one product (orbit / zoom), opened from
 * the Visualization screen. "Use this angle" turns the product's layer in the
 * room to face the way the model is facing here. Purely local — the GLB is
 * already on our server; nothing is generated.
 */

import React from 'react';

import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildModelViewerHtml } from '@/components/model3d/modelViewerHtml';
import { originOf } from '@/components/model3d/TurntableRenderer';
import { Colors } from '@/constants/colors';

type Props = {
  visible: boolean;
  productName: string;
  modelUrl: string;
  yawDeg: number;
  onUseAngle: (yawDeg: number) => void;
  onClose: () => void;
};

export default function ModelViewerModal({ visible, productName, modelUrl, yawDeg, onUseAngle, onClose }: Props) {
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [orbitYaw, setOrbitYaw] = React.useState<number | null>(null);

  // The page is built once per opening, starting at the product's current angle.
  const [initialYaw] = React.useState(yawDeg);
  const source = React.useMemo(
    () => ({ html: buildModelViewerHtml({ mode: 'viewer', modelUrl, initialYawDeg: initialYaw }), baseUrl: originOf(modelUrl) }),
    [modelUrl, initialYaw]
  );

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'loaded') setState('ready');
      else if (message.type === 'orbit') setOrbitYaw(message.yawDeg);
      else if (message.type === 'error') setState('error');
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>3D VIEW</Text>
          <Text style={styles.title} numberOfLines={1}>
            {productName}
          </Text>
          <Text style={styles.subtitle}>Drag to turn · pinch to zoom. AI-generated from your photo.</Text>
        </View>

        <View style={styles.stage}>
          <WebView
            style={styles.webview}
            containerStyle={styles.webview}
            source={source}
            originWhitelist={['*']}
            javaScriptEnabled
            mixedContentMode="always"
            androidLayerType="hardware"
            onMessage={handleMessage}
            onError={() => setState('error')}
            webviewDebuggingEnabled={__DEV__}
          />
          {state !== 'ready' && (
            <View style={styles.overlay} pointerEvents="none">
              {state === 'loading' ? (
                <ActivityIndicator size="large" color={Colors.accent} />
              ) : (
                <Text style={styles.errorText}>The 3D model couldn&apos;t be displayed.</Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primary, orbitYaw === null && styles.disabled]}
            disabled={orbitYaw === null}
            onPress={() => orbitYaw !== null && onUseAngle(orbitYaw)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryText}>USE THIS ANGLE IN MY ROOM</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.secondaryText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundElevated,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  eyebrow: {
    color: Colors.accentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 6,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  stage: {
    flex: 1,
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 10,
  },
  primary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.cardHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  secondary: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
