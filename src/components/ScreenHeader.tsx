/**
 * ScreenHeader — Consistent header component used across all screens.
 *
 * Supports:
 * - Back button
 * - Centered title + eyebrow
 * - Optional right action
 * - Spacer for centering when no right action
 */

import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';

import { Colors } from '@/constants/colors';

type ScreenHeaderProps = {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  /**
   * If false, the back button is not rendered.
   * Default: true
   */
  showBack?: boolean;
};

export default function ScreenHeader({
  title,
  eyebrow,
  onBack,
  rightElement,
  showBack = true,
}: ScreenHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.header}>
      {showBack ? (
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={styles.center}>
        {eyebrow ? (
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>

      {rightElement ? (
        <View style={styles.rightSlot}>{rightElement}</View>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backArrow: {
    color: Colors.textPrimary,
    fontSize: 20,
  },

  spacer: {
    width: 44,
  },

  center: {
    alignItems: 'center',
    flex: 1,
  },

  eyebrow: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },

  rightSlot: {
    width: 44,
    alignItems: 'flex-end',
  },
});
