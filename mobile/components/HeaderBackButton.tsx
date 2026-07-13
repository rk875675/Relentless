import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/lib/theme';

/**
 * Single source of truth for the stack-header back button (Programs "Home",
 * Lesson Pack "Library", etc). The sizing lives HERE — never inline in a screen.
 *
 * IMPORTANT: wire this via the navigator-level `Stack.Screen` options in
 * `app/_layout.tsx`, NOT via a screen component's own `<Stack.Screen headerLeft>`.
 * When it's set per-screen, the native back button renders first and this custom
 * button only swaps in after mount (setOptions) — so depending on how the screen
 * was entered you briefly (or permanently) see the tiny native chevron. Setting
 * it on the navigator applies it from the first frame, for every entry point.
 *
 * This button has regressed to "too small" repeatedly; keep it centralized.
 */
export function HeaderBackButton({
  label,
  fallbackHref,
}: {
  label: string;
  /** Where to go if there's nothing to pop (e.g. deep-linked into the screen). */
  fallbackHref: string;
}) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.btn}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallbackHref as never);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
    >
      <Ionicons name="chevron-back" size={30} color={colors.accentLight} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.accentLight,
    marginLeft: -1,
  },
});
