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
          >
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <Text style={styles.logo}>CHECK</Text>
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
              placeholderTextColor="#666666"
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
              placeholderTextColor="#666666"
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
              placeholderTextColor="#666666"
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
              placeholderTextColor="#666666"
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
          >
            {isLoading ? (
              <ActivityIndicator color="#111111" />
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
    backgroundColor: '#111111',
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
    marginBottom: 45,
  },

  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },

  backText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '300',
  },

  logoContainer: {
    alignItems: 'center',
  },

  logo: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },

  logoSubtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '300',
    letterSpacing: 1,
    marginTop: 2,
  },

  titleContainer: {
    marginBottom: 30,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },

  subtitle: {
    color: '#888888',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },

  form: {
    width: '100%',
  },

  inputContainer: {
    marginBottom: 17,
  },

  label: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  input: {
    height: 54,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    backgroundColor: '#181818',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 15,
  },

  signupButton: {
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  signupButtonDisabled: {
    opacity: 0.6,
  },

  signupButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },

  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
  },

  loginText: {
    color: '#777777',
    fontSize: 13,
  },

  loginLink: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
});