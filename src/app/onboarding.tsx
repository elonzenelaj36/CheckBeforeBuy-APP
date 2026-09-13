import { router } from 'expo-router';
import { useState } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const onboardingData = [
  {
    number: '01 / 03',
    title: 'See it in your home',
    description:
      'Visualize products in your real space before you buy them.',
    placeholder: 'YOUR ROOM',
  },
  {
    number: '02 / 03',
    title: 'Compare what you own',
    description:
      'Check if a new product is actually different from what you already have.',
    placeholder: 'YOUR FURNITURE',
  },
  {
    number: '03 / 03',
    title: 'Find the better deal',
    description:
      'Compare products and discover better or cheaper alternatives before spending your money.',
    placeholder: 'BETTER OPTIONS',
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
    <View style={styles.container}>

      <View style={styles.top}>
        <Text style={styles.step}>
          {current.number}
        </Text>
      </View>

      <View style={styles.content}>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {current.placeholder}
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
        >
          <Text style={styles.buttonText}>
            {currentPage === onboardingData.length - 1
              ? 'GET STARTED'
              : 'NEXT'}
          </Text>
        </TouchableOpacity>

      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },

  top: {
    alignItems: 'flex-end',
  },

  step: {
    color: '#777777',
    fontSize: 13,
    letterSpacing: 1,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
  },

  placeholder: {
    height: 300,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 35,
  },

  placeholderText: {
    color: '#555555',
    fontSize: 14,
    letterSpacing: 3,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
  },

  description: {
    color: '#999999',
    fontSize: 16,
    lineHeight: 25,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    marginRight: 6,
  },

  dot: {
    width: 8,
    height: 4,
    backgroundColor: '#444444',
    borderRadius: 2,
    marginRight: 6,
  },

  button: {
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
});