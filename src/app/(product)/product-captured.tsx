import React from 'react';

import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { updateProductCheckName } from '@/services/productChecks';
import { saveProduct } from '@/services/savedProducts';

export default function ProductCaptured() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    imageUri?: string | string[];
    productName?: string | string[];
    productCheckId?: string | string[];
  }>();

  const imageUri = Array.isArray(params.imageUri)
    ? params.imageUri[0]
    : params.imageUri;

  const initialName = Array.isArray(params.productName)
    ? params.productName[0]
    : (params.productName ?? '');

  const productCheckId = Array.isArray(params.productCheckId)
    ? params.productCheckId[0]
    : params.productCheckId;

  const [productName, setProductName] = React.useState(initialName);

  const [isSaving, setIsSaving] = React.useState(false);

  const [isUpdating, setIsUpdating] = React.useState(false);

  const isHistoryItem = Boolean(productCheckId);

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
        'Please enter a name for this product before saving.'
      );
      return;
    }

    setIsSaving(true);

    try {
      await saveProduct({
        name: productName.trim(),
        imageUri,
      });

      Alert.alert(
        'Product saved ✓',
        `"${productName.trim()}" has been added to your saved products.`,
        [
          {
            text: 'GO TO SAVED',
            onPress: () => router.replace('/saved'),
          },
          {
            text: 'CONTINUE',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      console.error(
        '[product-captured] Save failed:',
        error
      );

      Alert.alert(
        'Could not save',
        'We could not save this product. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateName = async () => {
    if (!productCheckId) {
      return;
    }

    if (!productName.trim()) {
      Alert.alert(
        'Product name needed',
        'Please enter a name for this product.'
      );
      return;
    }

    setIsUpdating(true);

    try {
      await updateProductCheckName(
        productCheckId,
        productName.trim()
      );

      Alert.alert(
        'Name updated ✓',
        `The product is now called "${productName.trim()}".`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error(
        '[product-captured] Update name failed:',
        error
      );

      Alert.alert(
        'Could not update',
        'We could not update the product name. Please try again.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const analyzeProduct = () => {
    if (!imageUri) {
      return;
    }

    router.push({
      pathname: '/product-analysis',
      params: {
        imageUri,
        // Only forward a name if the user actually typed one — an empty
        // field must NOT be sent as a fake "Unknown product" override,
        // since the backend treats any non-empty productName as the
        // user's deliberate choice and will use it instead of what the
        // AI actually detects.
        ...(productName.trim() ? { productName: productName.trim() } : {}),
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
        productName: productName.trim() || 'Unknown product',
        ...(productCheckId
          ? { productCheckId }
          : {}),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            eyebrow="PRODUCT CHECK"
            title="Product captured"
          />

          <View style={styles.intro}>
            <Text style={styles.title}>
              We&apos;ve got it.
            </Text>

            <Text style={styles.subtitle}>
              {isHistoryItem
                ? 'Update the product name or continue working with this checked product.'
                : 'Give this product a name, then choose what you want to do with it.'}
            </Text>
          </View>

          {/* Product Image */}

          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noImage}>
              <Text style={styles.noImageText}>
                Product photo unavailable
              </Text>
            </View>
          )}

          {/* Name Input */}

          <Text style={styles.inputLabel}>
            PRODUCT NAME
          </Text>

          <TextInput
            value={productName}
            onChangeText={setProductName}
            placeholder="e.g. Modern Lounge Chair"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="done"
          />

          {/* Save / Update Button */}

          <TouchableOpacity
            style={[
              styles.saveButton,
              (isSaving || isUpdating) &&
                styles.saveButtonDisabled,
            ]}
            onPress={
              isHistoryItem
                ? handleUpdateName
                : handleSaveProduct
            }
            disabled={isSaving || isUpdating}
            activeOpacity={0.85}
          >
            <Text style={styles.saveButtonText}>
              {isHistoryItem
                ? (isUpdating
                    ? 'UPDATING...'
                    : 'UPDATE NAME')
                : (isSaving
                    ? 'SAVING...'
                    : 'SAVE PRODUCT')}
            </Text>
          </TouchableOpacity>

          {/* Actions */}

          <Text style={styles.sectionTitle}>
            WHAT DO YOU WANT TO DO?
          </Text>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={visualizeProduct}
            activeOpacity={0.85}
          >
            <View style={styles.actionIconCircle}>
              <Text style={styles.actionIcon}>
                🏠
              </Text>
            </View>

            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>
                Generate into my room
              </Text>

              <Text style={styles.actionDescription}>
                See how this product could look in your
                actual space.
              </Text>
            </View>

            <Text style={styles.arrow}>
              →
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={analyzeProduct}
            activeOpacity={0.85}
          >
            <View style={styles.actionIconCircle}>
              <Text style={styles.actionIcon}>
                📊
              </Text>
            </View>

            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>
                Analyze this product
              </Text>

              <Text style={styles.actionDescription}>
                Check the price, specifications, and
                whether it is worth buying.
              </Text>
            </View>

            <Text style={styles.arrow}>
              →
            </Text>
          </TouchableOpacity>

          {/* Info card */}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              💡 NEXT STEP
            </Text>

            <Text style={styles.infoText}>
              Analyzing this product will run real AI
              recognition and add it to your check
              History automatically.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  flex: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  intro: {
    marginTop: 36,
    marginBottom: 22,
  },

  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },

  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },

  productImage: {
    width: '100%',
    height: 280,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },

  noImage: {
    width: '100%',
    height: 280,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noImageText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },

  inputLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 22,
    marginBottom: 10,
  },

  input: {
    height: 54,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    color: Colors.textPrimary,
    fontSize: 14,
  },

  saveButton: {
    height: 56,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 30,
    marginBottom: 12,
  },

  actionCard: {
    minHeight: 84,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },

  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  actionIcon: {
    fontSize: 20,
  },

  actionText: {
    flex: 1,
  },

  actionTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  actionDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  arrow: {
    color: Colors.accent,
    fontSize: 20,
  },

  infoCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: Colors.accentDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  infoTitle: {
    color: Colors.accentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
});
