import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>

      <View style={styles.logoContainer}>
        <Text style={styles.logo}>CHECK</Text>
        <Text style={styles.logoSubtitle}>Before Buy</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>
          Buy smarter.
        </Text>

        <Text style={styles.description}>
          See it in your space. Compare it with what you own.
          Know if it's worth buying.
        </Text>
      </View>

      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/onboarding')}
        >
          <Text style={styles.primaryButtonText}>
            GET STARTED
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.loginButtonText}>
            I ALREADY HAVE AN ACCOUNT
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
    paddingTop: 80,
    paddingBottom: 40,
  },

  logoContainer: {
    alignItems: 'center',
  },

  logo: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 3,
  },

  logoSubtitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '300',
    marginTop: 2,
    letterSpacing: 1,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '700',
    textAlign: 'center',
  },

  description: {
    color: '#AAAAAA',
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    marginTop: 20,
    maxWidth: 330,
  },

  bottomContainer: {
    width: '100%',
  },

  primaryButton: {
    backgroundColor: '#FFFFFF',
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },

  loginButton: {
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});