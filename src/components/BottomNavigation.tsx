/**
 * BottomNavigation — Main app tab bar.
 *
 * Tabs: HOME | CHECK | SAVED | PROFILE
 */

import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';

import { Colors } from '@/constants/colors';

type Tab = 'home' | 'check' | 'saved' | 'profile';

type BottomNavigationProps = {
  activeTab: Tab;
};

type NavigationTab = {
  name: Tab;
  label: string;
  icon: string;
  route: '/home' | '/check-product' | '/saved' | '/profile';
};

export default function BottomNavigation({
  activeTab,
}: BottomNavigationProps) {
  const router = useRouter();

  const tabs: NavigationTab[] = [
    {
      name: 'home',
      label: 'Home',
      icon: '⌂',
      route: '/home',
    },
    {
      name: 'check',
      label: 'Check',
      icon: '◎',
      route: '/check-product',
    },
    {
      name: 'saved',
      label: 'Saved',
      icon: '♡',
      route: '/saved',
    },
    {
      name: 'profile',
      label: 'Profile',
      icon: '◉',
      route: '/profile',
    },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name;

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => router.push(tab.route)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.icon,
                isActive && styles.activeIcon,
              ]}
            >
              {tab.icon}
            </Text>

            <Text
              style={[
                styles.label,
                isActive && styles.activeLabel,
              ]}
            >
              {tab.label}
            </Text>

            {isActive && (
              <View style={styles.activeDot} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 84,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 10,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    position: 'relative',
  },

  icon: {
    fontSize: 20,
    color: Colors.textMuted,
    marginBottom: 4,
  },

  activeIcon: {
    color: Colors.accent,
  },

  label: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },

  activeLabel: {
    color: Colors.accent,
    fontWeight: '700',
  },

  activeDot: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 2,
    backgroundColor: Colors.accent,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});