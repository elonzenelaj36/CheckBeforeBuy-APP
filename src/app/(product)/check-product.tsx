import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CheckProduct() {
  const router = useRouter();

  const { productId } =
    useLocalSearchParams<{
      productId?: string;
    }>();

  const [url, setUrl] = React.useState('');

  const continueToAnalysis = () => {
    router.push({
      pathname: '/product-analysis',
      params: {
        productId: productId || '1',
        url,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backArrow}>
            ←
          </Text>
        </TouchableOpacity>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>
            CHECK BEFORE BUY
          </Text>

          <Text style={styles.title}>
            What are you thinking about buying?
          </Text>

          <Text style={styles.subtitle}>
            Search for a product or paste a product link.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.option}
          onPress={() => router.push('/search')}
        >
          <View style={styles.icon}>
            <Text style={styles.iconText}>
              ⌕
            </Text>
          </View>

          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>
              Search products
            </Text>

            <Text style={styles.optionDescription}>
              Browse products available in the app.
            </Text>
          </View>

          <Text style={styles.arrow}>
            →
          </Text>
        </TouchableOpacity>

        <Text style={styles.or}>
          OR
        </Text>

        <Text style={styles.label}>
          PRODUCT LINK
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Paste product URL"
          placeholderTextColor="#666666"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={styles.button}
          onPress={continueToAnalysis}
        >
          <Text style={styles.buttonText}>
            ANALYZE PRODUCT
          </Text>
        </TouchableOpacity>
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
    padding: 20,
    paddingBottom: 40,
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

  intro: {
    marginTop: 42,
    marginBottom: 28,
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    marginTop: 8,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  icon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconText: {
    color: '#FFFFFF',
    fontSize: 24,
  },

  optionInfo: {
    flex: 1,
    marginLeft: 14,
  },

  optionTitle: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },

  optionDescription: {
    color: '#666666',
    fontSize: 12,
    marginTop: 5,
  },

  arrow: {
    color: '#111111',
    fontSize: 20,
  },

  or: {
    color: '#555555',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginVertical: 28,
  },

  label: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 9,
  },

  input: {
    height: 56,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 14,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 13,
  },

  button: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },

  buttonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});