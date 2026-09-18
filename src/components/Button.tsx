import {
    StyleSheet,
    Text,
    TouchableOpacity,
} from 'react-native';

import { Colors } from '@/constants/colors';

type ButtonProps = {
  title: string;
  onPress: () => void;
};

export default function Button({
  title,
  onPress,
}: ButtonProps) {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.text}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  text: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});