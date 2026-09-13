import React from 'react';

import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FindForMyHome() {
  const router = useRouter();

  const [category, setCategory] =
    React.useState('Furniture');

  const [budget, setBudget] =
    React.useState('');

  const categories = [
    'Furniture',
    'Lighting',
    'Storage',
    'Decor',
    'Electronics',
  ];

  const search = () => {
    router.push({
      pathname: '/recommendations',
      params: {
        category,
        budget,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
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
            FIND FOR MY HOME
          </Text>

          <Text style={styles.title}>
            Tell us what you need.
          </Text>

          <Text style={styles.subtitle}>
            We'll use your preferences to find products
            that fit your home and budget.
          </Text>
        </View>

        <Text style={styles.label}>
          CATEGORY
        </Text>

        <View style={styles.categories}>
          {categories.map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.category,
                category === item &&
                  styles.categoryActive,
              ]}
              onPress={() => setCategory(item)}
            >
              <Text
                style={[
                  styles.categoryText,
                  category === item &&
                    styles.categoryTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>
          MAXIMUM BUDGET
        </Text>

        <TextInput
          style={styles.input}
          placeholder="€500"
          placeholderTextColor="#666666"
          keyboardType="numeric"
          value={budget}
          onChangeText={setBudget}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={search}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            FIND PRODUCTS
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
    marginBottom: 32,
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
    fontWeight: '700',
    marginTop: 8,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  label: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 30,
  },

  category: {
    paddingHorizontal: 15,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryActive: {
    backgroundColor: '#FFFFFF',
  },

  categoryText: {
    color: '#888888',
    fontSize: 12,
  },

  categoryTextActive: {
    color: '#111111',
    fontWeight: '600',
  },

  input: {
    height: 56,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 14,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 24,
  },

  button: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});