import React from 'react';

import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';

export default function Settings() {
  const [notifications, setNotifications] =
    React.useState(true);

  const [personalization, setPersonalization] =
    React.useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="ACCOUNT" title="Settings" />

        <View style={styles.intro}>
          <Text style={styles.title}>
            Your preferences.
          </Text>
        </View>

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
            isLast
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

      <BottomNavigation activeTab="profile" />
    </SafeAreaView>
  );
}

function SettingRow({
  title,
  description,
  value,
  onChange,
  isLast,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.settingRow, isLast && styles.settingRowLast]}>
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
          false: Colors.border,
          true: Colors.accent,
        }}
        thumbColor={Colors.cardHighlight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },

  intro: {
    marginTop: 28,
    marginBottom: 24,
  },

  title: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },

  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  settingRow: {
    minHeight: 78,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  settingRowLast: {
    borderBottomWidth: 0,
  },

  settingInfo: {
    flex: 1,
    paddingRight: 12,
    paddingVertical: 14,
  },

  settingTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  settingDescription: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  infoCard: {
    marginTop: 20,
    padding: 18,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  infoTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
  },

  version: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 6,
  },
});
