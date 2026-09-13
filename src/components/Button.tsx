import {
    StyleSheet,
    Text,
    TouchableOpacity,
} from 'react-native';

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
    >
      <Text style={styles.text}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  text: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
});