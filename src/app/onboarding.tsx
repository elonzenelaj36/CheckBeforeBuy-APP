import { router } from 'expo-router';
import { useState } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';

const onboardingData = [
  {
    number: '01 / 03',
    title: 'See it in your home',
    description:
      'Visualize products in your real space before you buy them.',
    icon: '🏠',
  },
  {
    number: '02 / 03',
    title: 'Compare what you own',
    description:
      'Check if a new product is actually different from what you already have.',
    icon: '📦',
  },
  {
    number: '03 / 03',
    title: 'Find the better deal',
    description:
      'Compare products and discover better or cheaper alternatives before spending your money.',
    icon: '✓',
  },
];

export default function OnboardingScreen() {
  const [currentPage, setCurrentPage] = useState(0);

  const current = onboardingData[currentPage];

  function handleNext() {
    if (currentPage < onboardingData.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      router.push('/login');
    }
  }

  return (
    <SafeAreaView style={styles.container}>

      <View style={styles.top}>
        <Text style={styles.step}>
          {current.number}
        </Text>
      </View>

      <View style={styles.content}>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>
            {current.icon}
          </Text>
        </View>

        <Text style={styles.title}>
          {current.title}
        </Text>

        <Text style={styles.description}>
          {current.description}
        </Text>

      </View>

      <View style={styles.bottom}>

        <View style={styles.dots}>
          {onboardingData.map((_, index) => (
            <View
              key={index}
              style={
                index === currentPage
                  ? styles.activeDot
                  : styles.dot
              }
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {currentPage === onboardingData.length - 1
              ? 'GET STARTED'
              : 'NEXT'}
          </Text>
        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
    paddingHorizontal: 28,
    paddingBottom: 20,
  },

  top: {
    alignItems: 'flex-end',
    paddingTop: 10,
  },

  step: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
  },

  placeholder: {
    height: 260,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },

  placeholderIcon: {
    fontSize: 56,
  },

  title: {
    color: Colors.lightTextPrimary,
    fontSize: 32,
    fontWeight: '700',
  },

  description: {
    color: Colors.lightTextSecondary,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
  },

  bottom: {
    width: '100%',
  },

  dots: {
    flexDirection: 'row',
    marginBottom: 20,
  },

  activeDot: {
    width: 28,
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
    marginRight: 6,
  },

  dot: {
    width: 8,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginRight: 6,
  },

  button: {
    height: 58,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    color: Colors.cardHighlightText,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
