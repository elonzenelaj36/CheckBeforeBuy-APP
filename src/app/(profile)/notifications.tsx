import {
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import EmptyState from '@/components/EmptyState';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';

export default function Notifications() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="UPDATES" title="Notifications" />

        <Text style={styles.subtitle}>
          Important product alerts, price changes and recommendations will appear here.
        </Text>

        <EmptyState
          icon="🔔"
          title="You're all caught up"
          description="There's nothing new right now. We'll let you know when there's something worth seeing."
        />
      </ScrollView>
    </SafeAreaView>
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
    paddingBottom: 40,
  },

  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 24,
    marginBottom: 24,
  },
});
