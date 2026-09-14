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
          <View style={styles.list}>
            {historyItems.map((item) => (
              <TouchableOpacity
                key={item.id}
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
                <Image
                  source={{ uri: item.imageUri ?? undefined }}
                  style={styles.image}
                />

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
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  clearText: {
    color: Colors.dangerText,
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    marginTop: 20,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    gap: 12,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
  },
  info: {
    flex: 1,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  date: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    backgroundColor: Colors.accentDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    color: Colors.accentText,
    fontSize: 9,
    fontWeight: '600',
  },
  arrow: {
    color: Colors.accent,
    fontSize: 18,
    marginRight: 6,
  },
});