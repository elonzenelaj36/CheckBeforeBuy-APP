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
          <Text style={styles.logo}>
            CHECK
          </Text>

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
            placeholderTextColor="#666666"
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
            placeholderTextColor="#666666"
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
        >
          {isLoading ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Text style={styles.loginButtonText}>
              LOGIN
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

        <TouchableOpacity style={styles.googleButton}>
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
    backgroundColor: '#111111',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 30,
  },

  content: {
    flex: 1,
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 55,
  },

  logo: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 3,
  },

  logoSubtitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '300',
    letterSpacing: 1,
    marginTop: 2,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
  },

  description: {
    color: '#888888',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    marginBottom: 35,
  },

  inputContainer: {
    marginBottom: 18,
  },

  label: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  input: {
    height: 55,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
    backgroundColor: '#181818',
  },

  forgotContainer: {
    alignItems: 'flex-end',
    marginTop: -4,
    marginBottom: 25,
  },

  forgotText: {
    color: '#AAAAAA',
    fontSize: 13,
  },

  loginButton: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loginButtonDisabled: {
    opacity: 0.6,
  },

  loginButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#2D2D2D',
  },

  orText: {
    color: '#666666',
    fontSize: 11,
    marginHorizontal: 14,
  },

  googleButton: {
    height: 55,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 10,
  },

  googleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },

  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },

  signupText: {
    color: '#777777',
    fontSize: 13,
  },

  signupButton: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
});