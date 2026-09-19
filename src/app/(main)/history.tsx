import React from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import EmptyState from '@/components/EmptyState';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { CheckedProduct, clearHistory, getHistory } from '@/services/history';

export default function History() {
  const router = useRouter();
  const [historyItems, setHistoryItems] = React.useState<CheckedProduct[]>([]);

  const loadHistory = async () => {
    const items = await getHistory();
    setHistoryItems(items);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadHistory();
    }, [])
  );

  const handleClear = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear your product check history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            loadHistory();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow="ACTIVITY"
          title="Check History"
          titleColor={Colors.lightTextStrong}
          eyebrowColor={Colors.lightTextBody}
          rightElement={
            historyItems.length > 0 ? (
              <TouchableOpacity onPress={handleClear}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />

        {historyItems.length === 0 ? (
          <EmptyState
            icon="🕒"
            title="Nothing checked yet"
            description="Products you check will appear here so you can quickly review them later."
            actionLabel="CHECK A PRODUCT"
            onAction={() => router.push('/check-product')}
          />
        ) : (
          <View style={styles.listPanel}>
            {historyItems.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <View style={styles.divider} />}

                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/product-captured',
                      params: {
                        imageUri: item.imageUri,
                        productName: item.name,
                        productCheckId: item.id,
                      },
                    })
                  }
                >
                  <View style={styles.imageFrame}>
                    <Image
                      source={{ uri: item.imageUri ?? undefined }}
                      style={styles.image}
                    />
                  </View>

                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>

                    <Text style={styles.date}>
                      Checked {new Date(item.checkedAt).toLocaleDateString()}
                    </Text>

                    <View style={styles.tags}>
                      {item.hasAnalysis && (
                        <View style={styles.tag}>
                          <Text style={styles.tagText}>✓ Analyzed</Text>
                        </View>
                      )}

                      {item.hasVisualization && (
                        <View style={styles.tag}>
                          <Text style={styles.tagText}>✓ Visualized</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomNavigation activeTab="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  clearText: {
    color: Colors.lightDangerText,
    fontSize: 12,
    fontWeight: '600',
  },
  listPanel: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(143, 192, 255, 0.12)',
    backgroundColor: '#D8E3F0',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(143, 192, 255, 0.08)',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  imageFrame: {
    padding: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(143, 192, 255, 0.16)',
    shadowColor: Colors.homeAccent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: Colors.homeSurfaceRaised,
  },
  info: {
    flex: 1,
  },
  name: {
    color: Colors.lightTextStrong,
    fontSize: 15,
    fontWeight: '600',
  },
  date: {
    color: Colors.lightTextSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    backgroundColor: Colors.homeAccentDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    color: Colors.homeAccentText,
    fontSize: 9,
    fontWeight: '600',
  },
  arrow: {
    color: Colors.lightAccentText,
    fontSize: 18,
    marginRight: 6,
  },
});