import { router } from 'expo-router';
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';
import { restoreSession } from '@/services/auth';

export default function WelcomeScreen() {
  React.useEffect(() => {
    restoreSession().then((user) => {
      if (user) {
        router.replace('/home');
      }
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.logoContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoCheck}>
              CHECK
            </Text>
          </View>

          <Text style={styles.logoSubtitle}>
            Before Buy
          </Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>
            Buy smarter.
          </Text>

          <Text style={styles.description}>
            See it in your space. Compare it with what
            you own. Know if it&apos;s worth buying.
          </Text>
        </View>

        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/onboarding')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              GET STARTED
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/login')}
            activeOpacity={0.8}
          >
            <Text style={styles.loginButtonText}>
              I ALREADY HAVE AN ACCOUNT
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 20,
  },

  logoContainer: {
    alignItems: 'center',
    paddingTop: 48,
  },

  logoBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },

  logoCheck: {
    color: Colors.cardHighlight,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },

  logoSubtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '400',
    marginTop: 10,
    letterSpacing: 0.5,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    color: Colors.textPrimary,
    fontSize: 42,
    fontWeight: '700',
    textAlign: 'center',
  },

  description: {
    color: Colors.textSecondary,
    fontSize: 16,
    lineHeight: 25,
    textAlign: 'center',
    marginTop: 20,
    maxWidth: 340,
  },

  bottomContainer: {
    width: '100%',
  },

  primaryButton: {
    backgroundColor: Colors.accent,
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    color: Colors.cardHighlight,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  loginButton: {
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  loginButtonText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});