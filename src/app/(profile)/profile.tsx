import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';

export default function Profile() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <View style={styles.profileCircle}>
          <Text style={styles.profileLetter}>
            E
          </Text>
        </View>

        <Text style={styles.name}>
          Elon
        </Text>

        <Text style={styles.email}>
          elon@example.com
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
        </View>

        <TouchableOpacity
          style={styles.logout}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.logoutText}>
            LOG OUT
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    backgroundColor: '#111111',
  },

  content: {
    padding: 20,
    alignItems: 'center',
    paddingBottom: 40,
  },

  profileCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },

  profileLetter: {
    color: '#111111',
    fontSize: 28,
    fontWeight: '700',
  },

  name: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 15,
  },

  email: {
    color: '#777777',
    fontSize: 13,
    marginTop: 5,
  },

  menu: {
    width: '100%',
    marginTop: 35,
  },

  menuItem: {
    height: 62,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  menuTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  arrow: {
    color: '#FFFFFF',
    fontSize: 18,
  },

  logout: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 25,
  },

  logoutText: {
    color: '#AAAAAA',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
});