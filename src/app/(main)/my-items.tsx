import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import EmptyState from '@/components/EmptyState';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import {
  createUserItem,
  deleteUserItem,
  getUserItems,
  UserItem,
} from '@/services/userItems';

export default function MyItems() {
  const [items, setItems] = React.useState<UserItem[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [itemName, setItemName] = React.useState('');
  const [itemCategory, setItemCategory] = React.useState('Furniture');

  const categories = ['Furniture', 'Electronics', 'Lighting', 'Storage', 'Decor', 'Other'];

  const loadItems = async () => {
    const data = await getUserItems();
    setItems(data);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadItems();
    }, [])
  );

  const handleCreate = async () => {
    if (!itemName.trim()) {
      Alert.alert('Item name required', 'Please enter a name for the item you own.');
      return;
    }

    await createUserItem({
      name: itemName.trim(),
      category: itemCategory,
    });

    setItemName('');
    setShowAddModal(false);
    loadItems();
  };

  const handleDelete = (item: UserItem) => {
    Alert.alert('Remove Item', `Remove "${item.name}" from your belongings?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteUserItem(item.id);
          loadItems();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow="YOUR BELONGINGS"
          title="My Items"
          rightElement={
            <TouchableOpacity onPress={() => setShowAddModal(!showAddModal)}>
              <Text style={styles.addBtnText}>{showAddModal ? 'Cancel' : '+ Add'}</Text>
            </TouchableOpacity>
          }
        />

        <View style={styles.intro}>
          <Text style={styles.title}>Things you own.</Text>
          <Text style={styles.subtitle}>
            Logging items you already own helps Check Before Buy avoid duplicate recommendations and verify style compatibility.
          </Text>
        </View>

        {/* Add Item Form */}
        {showAddModal && (
          <View style={styles.addForm}>
            <Text style={styles.formTitle}>Add item you own</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Grey Fabric Sofa, Samsung TV"
              placeholderTextColor={Colors.textMuted}
              value={itemName}
              onChangeText={setItemName}
            />

            <Text style={styles.label}>CATEGORY</Text>
            <View style={styles.chipGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, itemCategory === cat && styles.chipActive]}
                  onPress={() => setItemCategory(cat)}
                >
                  <Text style={[styles.chipText, itemCategory === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleCreate}>
              <Text style={styles.submitBtnText}>SAVE BELONGING</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Items List */}
        {items.length === 0 ? (
          <EmptyState
            icon="🛋️"
            title="No items logged"
            description="Add furniture, electronics, or decor you already own so AI can check for similar items before you buy."
            actionLabel="+ LOG FIRST ITEM"
            onAction={() => setShowAddModal(true)}
          />
        ) : (
          <View style={styles.itemList}>
            {items.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemIcon}>
                  <Text style={styles.itemIconText}>📦</Text>
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.category}</Text>
                </View>

                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomNavigation activeTab="profile" />
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
  addBtnText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  intro: {
    marginTop: 30,
    marginBottom: 20,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  addForm: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  formTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    height: 48,
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    color: Colors.textPrimary,
    fontSize: 13,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  chipTextActive: {
    color: Colors.accentText,
    fontWeight: '700',
  },
  submitBtn: {
    height: 46,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  submitBtnText: {
    color: Colors.cardHighlightText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  itemList: {
    gap: 10,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 12,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconText: {
    fontSize: 20,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  itemMeta: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
