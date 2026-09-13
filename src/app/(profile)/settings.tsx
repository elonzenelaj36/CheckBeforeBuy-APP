import React from 'react';

import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';

export default function Settings() {
  const router = useRouter();

  const [notifications, setNotifications] =
    React.useState(true);

  const [personalization, setPersonalization] =
    React.useState(true);

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

        <Text style={styles.eyebrow}>
          ACCOUNT
        </Text>

        <Text style={styles.title}>
          Settings.
        </Text>

        <View style={styles.section}>
          <SettingRow
            title="Notifications"
            description="Receive useful product updates."
            value={notifications}
            onChange={setNotifications}
          />

          <SettingRow
            title="Personalization"
            description="Use your activity to improve recommendations."
            value={personalization}
            onChange={setPersonalization}
          />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            Check Before Buy
          </Text>

          <Text style={styles.infoText}>
            Phase 1 prototype
          </Text>

          <Text style={styles.version}>
            Version 1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>
          {title}
        </Text>

        <Text style={styles.settingDescription}>
          {description}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{
          false: '#2D2D2D',
          true: '#777777',
        }}
        thumbColor="#FFFFFF"
      />
    </View>
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
    marginBottom: 30,
  },

  backArrow: {
    color: '#FFFFFF',
    fontSize: 20,
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
    marginTop: 7,
  },

  section: {
    marginTop: 30,
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    overflow: 'hidden',
  },

  settingRow: {
    minHeight: 82,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
  },

  settingInfo: {
    flex: 1,
    paddingRight: 12,
  },

  settingTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  settingDescription: {
    color: '#777777',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  infoCard: {
    marginTop: 25,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  infoText: {
    color: '#777777',
    fontSize: 12,
    marginTop: 7,
  },

  version: {
    color: '#555555',
    fontSize: 10,
    marginTop: 5,
  },
});