import {
    StyleSheet,
    Text,
    View,
} from 'react-native';

type SectionTitleProps = {
  title: string;
  action?: string;
  onAction?: () => void;
};

export default function SectionTitle({
  title,
  action,
  onAction,
}: SectionTitleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {title}
      </Text>

      {action && (
        <Text
          style={styles.action}
          onPress={onAction}
        >
          {action}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  title: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  action: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
});