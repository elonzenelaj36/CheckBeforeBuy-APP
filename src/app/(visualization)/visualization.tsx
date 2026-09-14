import React from 'react';

import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Visualization() {
  const router = useRouter();

  const {
    roomType,
    imageUri,
  } = useLocalSearchParams<{
    roomType: string;
    imageUri: string;
    productMode?: string;
  }>();

  const [generated, setGenerated] =
    React.useState(false);

  const generateVisualization = () => {
    setGenerated(true);
  };

  const saveRoom = () => {
    router.replace('/my-home');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backArrow}>
              ←
            </Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.eyebrow}>
              VISUALIZATION
            </Text>

            <Text style={styles.headerTitle}>
              {roomType}
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            {generated
              ? 'See it in your space.'
              : 'Your room is ready.'}
          </Text>

          <Text style={styles.subtitle}>
            {generated
              ? 'This is where the generated visualization will appear.'
              : `We'll place the product inside your ${roomType?.toLowerCase()}.`}
          </Text>
        </View>

        {/* Visualization */}
        <View style={styles.visualizationContainer}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.roomImage}
            />
          ) : (
            <View style={styles.fakeRoom}>
              <View style={styles.floor} />

              <View style={styles.fakeFurniture}>
                <View style={styles.furnitureTop} />
                <View style={styles.furnitureBody} />
              </View>

              <View style={styles.fakeLamp}>
                <View style={styles.lampShade} />
                <View style={styles.lampStand} />
              </View>
            </View>
          )}

          {!generated && (
            <View style={styles.overlay}>
              <View style={styles.overlayCircle}>
                <Text style={styles.overlaySymbol}>
                  +
                </Text>
              </View>

              <Text style={styles.overlayTitle}>
                Ready to generate
              </Text>

              <Text style={styles.overlayDescription}>
                Your product will be placed into this
                room.
              </Text>
            </View>
          )}

          {generated && (
            <View style={styles.generatedBadge}>
              <Text style={styles.generatedBadgeText}>
                AI VISUALIZATION
              </Text>
            </View>
          )}
        </View>

        {/* Product */}
        {imageUri && (
          <View style={styles.productCard}>
            <Image
              source={{ uri: imageUri }}
              style={styles.productThumbnail}
            />

            <View style={styles.productText}>
              <Text style={styles.productLabel}>
                PRODUCT
              </Text>

              <Text style={styles.productTitle}>
                Product from your photo
              </Text>

              <Text style={styles.productDescription}>
                This product will be placed into your
                selected room.
              </Text>
            </View>
          </View>
        )}

        {/* Generate */}
        {!generated && (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateVisualization}
            activeOpacity={0.85}
          >
            <Text style={styles.generateButtonText}>
              GENERATE INTO MY ROOM
            </Text>
          </TouchableOpacity>
        )}

        {/* Generated result */}
        {generated && (
          <>
            <View style={styles.resultCard}>
              <Text style={styles.resultEyebrow}>
                RESULT
              </Text>

              <Text style={styles.resultTitle}>
                Does it fit your space?
              </Text>

              <Text style={styles.resultDescription}>
                In the real version, AI will analyze the
                room and product together to create a
                realistic visualization.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveRoom}
              activeOpacity={0.85}
            >
              <Text style={styles.saveButtonText}>
                BACK TO MY HOME
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Disclaimer */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            Visualization preview
          </Text>

          <Text style={styles.infoText}>
            This Phase 1 version demonstrates the
            experience. Real AI image generation will be
            connected later.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backArrow: {
    color: '#FFFFFF',
    fontSize: 20,
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 44,
  },

  intro: {
    marginTop: 42,
    marginBottom: 26,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  visualizationContainer: {
    width: '100%',
    height: 330,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    position: 'relative',
  },

  roomImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    opacity: 0.8,
  },

  fakeRoom: {
    flex: 1,
    backgroundColor: '#252525',
    position: 'relative',
  },

  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    backgroundColor: '#1B1B1B',
  },

  fakeFurniture: {
    position: 'absolute',
    left: 45,
    bottom: 65,
    width: 180,
    height: 100,
  },

  furnitureTop: {
    height: 25,
    backgroundColor: '#777777',
    borderRadius: 8,
  },

  furnitureBody: {
    height: 65,
    backgroundColor: '#555555',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },

  fakeLamp: {
    position: 'absolute',
    right: 45,
    bottom: 65,
    alignItems: 'center',
  },

  lampShade: {
    width: 55,
    height: 35,
    backgroundColor: '#888888',
    borderRadius: 8,
  },

  lampStand: {
    width: 5,
    height: 75,
    backgroundColor: '#666666',
  },

  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,17,0.45)',
  },

  overlayCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  overlaySymbol: {
    color: '#111111',
    fontSize: 30,
    fontWeight: '300',
  },

  overlayTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 14,
  },

  overlayDescription: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 6,
  },

  generatedBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },

  generatedBadgeText: {
    color: '#111111',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },

  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 12,
    marginTop: 14,
  },

  productThumbnail: {
    width: 62,
    height: 62,
    borderRadius: 10,
  },

  productText: {
    flex: 1,
    marginLeft: 12,
  },

  productLabel: {
    color: '#777777',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  productTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },

  productDescription: {
    color: '#777777',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  generateButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  generateButtonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  resultCard: {
    marginTop: 18,
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 20,
  },

  resultEyebrow: {
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  resultTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
    marginTop: 9,
  },

  resultDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },

  saveButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  saveButtonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  infoCard: {
    marginTop: 28,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  infoText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
});