import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '@/lib/theme';

type ErrorBoundaryProps = {
  error: Error;
  retry: () => Promise<void> | void;
};

/**
 * Replaces expo-router's default red crash screen. A thrown render error must
 * never look like a broken app — retry here remounts the failed segment.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) {
    console.warn('[ErrorBoundary]', error?.message ?? error);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>Please try again. Your progress is saved.</Text>
      <TouchableOpacity style={styles.button} onPress={() => void retry()} activeOpacity={0.85}>
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
