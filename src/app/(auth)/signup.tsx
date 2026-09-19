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
import { register } from '@/services/auth';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing information', 'Please fill in every field.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Please make sure both passwords are the same.');
      return;
    }

    setIsLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace('/home');
    } catch (error: any) {
      Alert.alert(
        'Sign up failed',
        error?.message ?? 'Could not create your account. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>

        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoCheck}>CHECK</Text>
            </View>
            <Text style={styles.logoSubtitle}>Before Buy</Text>
          </View>
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            Create your account.
          </Text>

          <Text style={styles.subtitle}>
            Start making smarter shopping decisions.
          </Text>
        </View>

        <View style={styles.form}>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>NAME</Text>

            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>EMAIL</Text>

            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>PASSWORD</Text>

            <TextInput
              style={styles.input}
              placeholder="Create a password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>CONFIRM PASSWORD</Text>

            <TextInput
              style={styles.input}
              placeholder="Repeat your password"
              placeholderTextColor={Colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.signupButton, isLoading && styles.signupButtonDisabled]}
            onPress={handleSignup}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.cardHighlightText} />
            ) : (
              <Text style={styles.signupButtonText}>
                CREATE ACCOUNT
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>
              Already have an account?
            </Text>

            <TouchableOpacity
              onPress={() => router.push('/login')}
            >
              <Text style={styles.loginLink}>
                Login
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
    paddingHorizontal: 28,
    paddingTop: 55,
    paddingBottom: 30,
  },

  content: {
    flex: 1,
  },

  header: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 40,
  },

  backButton: {
    position: 'absolute',
    left: 0,
    top: -4,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backText: {
    color: Colors.textPrimary,
    fontSize: 20,
  },

  logoContainer: {
    alignItems: 'center',
  },

  logoBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9,
  },

  logoCheck: {
    color: Colors.cardHighlight,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 3,
  },

  logoSubtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginTop: 8,
  },

  titleContainer: {
    marginBottom: 26,
  },

  title: {
    color: Colors.lightTextPrimary,
    fontSize: 30,
    fontWeight: '700',
  },

  subtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  form: {
    width: '100%',
  },

  inputContainer: {
    marginBottom: 14,
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
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    paddingHorizontal: 16,
    fontSize: 14,
  },

  signupButton: {
    height: 56,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  signupButtonDisabled: {
    opacity: 0.6,
  },

  signupButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },

  loginText: {
    color: Colors.lightTextSecondary,
    fontSize: 13,
  },

  loginLink: {
    color: Colors.lightAccentText,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
});
