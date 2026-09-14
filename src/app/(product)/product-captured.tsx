import React from 'react';

import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveProduct } from '@/services/savedProducts';

export default function ProductCaptured() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    imageUri?: string | string[];
    productName?: string | string[];
  }>();

  const imageUri = Array.isArray(params.imageUri)
    ? params.imageUri[0]
    : params.imageUri;

  const savedProductName = Array.isArray(params.productName)
    ? params.productName[0]
    : params.productName;

  const [productName, setProductName] = React.useState(
    savedProductName ?? ''
  );

  const [isSaving, setIsSaving] = React.useState(false);

  const handleSaveProduct = async () => {
    if (!imageUri) {
      Alert.alert(
        'No product photo',
        'We could not find the product photo.'
      );

      return;
    }

    if (!productName.trim()) {
      Alert.alert(
        'Product name needed',
        'Please enter a name for this product.'
      );

      return;
    }

    setIsSaving(true);

    await saveProduct({
      id: Date.now().toString(),
      name: productName.trim(),
      imageUri: imageUri,
    });

    setIsSaving(false);

    Alert.alert(
      'Product saved',
      'This product has been added to your saved products.',
      [
        {
          text: 'GO TO SAVED',
          onPress: () => router.replace('/saved'),
        },
        {
          text: 'DONE',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const analyzeProduct = () => {
    if (!imageUri) {
      return;
    }

    router.push({
      pathname: '/product-analysis',
      params: {
        imageUri: imageUri,
      },
    });
  };

  const visualizeProduct = () => {
    if (!imageUri) {
      return;
    }

    router.push({
      pathname: '/select-room',
      params: {
        productImageUri: imageUri,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.eyebrow}>
              PRODUCT CHECK
            </Text>

            <Text style={styles.headerTitle}>
              Product captured
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>
            We've got it.
          </Text>

          <Text style={styles.subtitle}>
            Give this product a name, then choose what
            you want to do with it.
          </Text>
        </View>

        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.productImage}
          />
        ) : (
          <View style={styles.noImage}>
            <Text style={styles.noImageText}>
              Product photo unavailable
            </Text>
          </View>
        )}

        <Text style={styles.inputLabel}>
          PRODUCT NAME
        </Text>

        <TextInput
          value={productName}
          onChangeText={setProductName}
          placeholder="e.g. Modern Lounge Chair"
          placeholderTextColor="#666666"
          style={styles.input}
          autoCapitalize="words"
        />

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveProduct}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'SAVING...' : 'SAVE TO SAVED'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>
          WHAT DO YOU WANT TO DO?
        </Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={visualizeProduct}
          activeOpacity={0.85}
        >
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>
              Generate into my room
            </Text>

            <Text style={styles.actionDescription}>
              See how this product could look in your
              actual space.
            </Text>
          </View>

          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={analyzeProduct}
          activeOpacity={0.85}
        >
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>
              Analyze this product
            </Text>

            <Text style={styles.actionDescription}>
              Check the product, price, specifications,
              and whether it is worth buying.
            </Text>
          </View>

          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            YOU CAN SAVE IT NOW
          </Text>

          <Text style={styles.infoText}>
            Saved products will stay on your device so you
            can come back to them later.
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
    marginBottom: 24,
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

  productImage: {
    width: '100%',
    height: 280,
    borderRadius: 20,
    backgroundColor: '#181818',
  },

  noImage: {
    width: '100%',
    height: 280,
    borderRadius: 20,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  noImageText: {
    color: '#777777',
    fontSize: 13,
  },

  inputLabel: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 10,
  },

  input: {
    height: 54,
    backgroundColor: '#181818',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },

  saveButton: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
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

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 32,
    marginBottom: 12,
  },

  actionCard: {
    minHeight: 90,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  actionText: {
    flex: 1,
  },

  actionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  actionDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  arrow: {
    color: '#FFFFFF',
    fontSize: 20,
    marginLeft: 12,
  },

  infoCard: {
    marginTop: 20,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  infoTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  infoText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },
});