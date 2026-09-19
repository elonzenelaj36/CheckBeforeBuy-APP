import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '@/constants/colors';
import { login } from '@/services/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing information', 'Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/home');
    } catch (error: any) {
      Alert.alert(
        'Login failed',
        error?.message ?? 'Could not sign in. Please check your credentials and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >

      <View style={styles.content}>

        {/* Logo */}

        <View style={styles.logoContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoCheck}>CHECK</Text>
          </View>

          <Text style={styles.logoSubtitle}>
            Before Buy
          </Text>
        </View>

        {/* Heading */}

        <Text style={styles.title}>
          Welcome back.
        </Text>

        <Text style={styles.description}>
          Sign in to continue making smarter
          shopping decisions.
        </Text>

        {/* Email */}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>
            EMAIL
          </Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Password */}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>
            PASSWORD
          </Text>

          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        {/* Forgot password */}

        <TouchableOpacity style={styles.forgotContainer}>
          <Text style={styles.forgotText}>
            Forgot password?
          </Text>
        </TouchableOpacity>

        {/* Login */}

        <TouchableOpacity
          style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.cardHighlightText} />
          ) : (
            <Text style={styles.loginButtonText}>
              LOG IN
            </Text>
          )}
        </TouchableOpacity>

        {/* Divider */}

        <View style={styles.dividerContainer}>

          <View style={styles.divider} />

          <Text style={styles.orText}>
            OR
          </Text>

          <View style={styles.divider} />

        </View>

        {/* Google */}

        <TouchableOpacity style={styles.googleButton} activeOpacity={0.85}>
          <Text style={styles.googleButtonText}>
            G
          </Text>

          <Text style={styles.googleText}>
            Continue with Google
          </Text>
        </TouchableOpacity>

      </View>

      {/* Sign up */}

      <View style={styles.signupContainer}>

        <Text style={styles.signupText}>
          Don&apos;t have an account?
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.signupButton}>
            Sign up
          </Text>
        </TouchableOpacity>

      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 30,
  },

  content: {
    flex: 1,
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },

  logoBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },

  logoCheck: {
    color: Colors.cardHighlight,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
  },

  logoSubtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginTop: 10,
  },

  title: {
    color: Colors.lightTextPrimary,
    fontSize: 32,
    fontWeight: '700',
  },

  description: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 32,
  },

  inputContainer: {
    marginBottom: 16,
  },

  label: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  input: {
    height: 54,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: Colors.textPrimary,
    fontSize: 14,
    backgroundColor: Colors.surface,
  },

  forgotContainer: {
    alignItems: 'flex-end',
    marginTop: -4,
    marginBottom: 24,
  },

  forgotText: {
    color: Colors.lightTextSecondary,
    fontSize: 13,
  },

  loginButton: {
    height: 56,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loginButtonDisabled: {
    opacity: 0.6,
  },

  loginButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },

  orText: {
    color: Colors.lightTextMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginHorizontal: 14,
  },

  googleButton: {
    height: 54,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  googleButtonText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 10,
  },

  googleText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },

  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },

  signupText: {
    color: Colors.lightTextSecondary,
    fontSize: 13,
  },

  signupButton: {
    color: Colors.lightAccentText,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
});
