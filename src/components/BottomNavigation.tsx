import { useRouter } from 'expo-router';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Tab = 'home' | 'search' | 'saved' | 'profile';

type BottomNavigationProps = {
  activeTab: Tab;
};

type NavigationTab = {
  name: Tab;
  label: string;
  route: '/home' | '/search' | '/saved' | '/profile';
};

export default function BottomNavigation({
  activeTab,
}: BottomNavigationProps) {
  const router = useRouter();

  const tabs: NavigationTab[] = [
    {
      name: 'home',
      label: 'Home',
      route: '/home',
    },
    {
      name: 'search',
      label: 'Search',
      route: '/search',
    },
    {
      name: 'saved',
      label: 'Saved',
      route: '/saved',
    },
    {
      name: 'profile',
      label: 'Profile',
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
          >
            <View
              style={[
                styles.icon,
                isActive && styles.activeIcon,
              ]}
            />

            <Text
              style={[
                styles.label,
                isActive && styles.activeLabel,
              ]}
            >
              {tab.label}
            </Text>
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

    height: 82,

    backgroundColor: '#111111',

    borderTopWidth: 1,
    borderTopColor: '#2D2D2D',

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',

    paddingBottom: 8,
  },

  tab: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },

  icon: {
    width: 6,
    height: 6,

    borderRadius: 3,

    backgroundColor: '#555555',

    marginBottom: 8,
  },

  activeIcon: {
    backgroundColor: '#FFFFFF',
  },

  label: {
    fontSize: 11,
    color: '#666666',
  },

  activeLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});