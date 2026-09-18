import {
    ScrollView,
    StyleSheet,
    View,
    ViewProps,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/colors';

type ScreenProps = ViewProps & {
  children: React.ReactNode;
  scroll?: boolean;
};

export default function Screen({
  children,
  scroll = true,
  style,
  ...props
}: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View
            style={[styles.inner, style]}
            {...props}
          >
            {children}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={[styles.inner, style]}
        {...props}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    paddingBottom: 40,
  },

  inner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
});