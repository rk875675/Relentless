import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

/** Softened red for legibility on the dark surface card (vs. the more saturated colors.error). */
const ERROR_TEXT_COLOR = '#F28B82';

/** Subtle inline error card used across auth screens instead of bare red text. */
export function InlineErrorCard({
  message,
  style,
}: {
  message: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="alert-circle-outline" size={16} color={ERROR_TEXT_COLOR} style={styles.icon} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  icon: {
    marginRight: 8,
    marginTop: 1,
  },
  text: {
    flex: 1,
    color: ERROR_TEXT_COLOR,
    fontSize: 13,
    textAlign: 'left',
    lineHeight: 18,
  },
});
