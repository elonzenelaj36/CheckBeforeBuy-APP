import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect, useRouter } from 'expo-router';

import BottomNavigation from '@/components/BottomNavigation';
import { Colors } from '@/constants/colors';
import { AuthUser, getCurrentUser, logout } from '@/services/auth';

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      setUser(getCurrentUser());
    }, [])
  );

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const initial = (user?.name || 'U').charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <View style={styles.profileCircle}>
          <Text style={styles.profileLetter}>
            {initial}
          </Text>
        </View>

        <Text style={styles.name}>
          {user?.name || 'Guest'}
        </Text>

        <Text style={styles.email}>
          {user?.email || 'Not signed in'}
        </Text>

        <View style={styles.menu}>
          <MenuItem
            title="Settings"
            onPress={() =>
              router.push('/settings')
            }
          />

          <MenuItem
            title="Notifications"
            onPress={() =>
              router.push('/notifications')
            }
          />

          <MenuItem
            title="My Home"
            onPress={() =>
              router.push('/my-home')
            }
          />

          <MenuItem
            title="My Items"
            onPress={() =>
              router.push('/my-items')
            }
          />
        </View>

        <TouchableOpacity
          style={styles.logout}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>
            LOG OUT
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomNavigation activeTab="profile" />
    </SafeAreaView>
  );
}

function MenuItem({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
    >
      <Text style={styles.menuTitle}>
        {title}
      </Text>

      <Text style={styles.arrow}>
        →
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    padding: 20,
    alignItems: 'center',
    paddingBottom: 140,
  },

  profileCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },

  profileLetter: {
    color: Colors.cardHighlight,
    fontSize: 28,
    fontWeight: '700',
  },

  name: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 15,
  },

  email: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 5,
  },

  menu: {
    width: '100%',
    marginTop: 35,
  },

  menuItem: {
    height: 62,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  menuTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  arrow: {
    color: Colors.textPrimary,
    fontSize: 18,
  },

  logout: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 25,
  },

  logoutText: {
    color: Colors.dangerText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
});
