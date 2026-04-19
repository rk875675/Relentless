import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';
import { pickMacColor } from '@/lib/mac-categories';

// Tap-to-toggle multi-choice list. No time-locks, no countdown — Confirm is
// gated only by `minSelect` (0 = always enabled). Matches the tap-through
// pacing used across the rest of the lesson player.
type Props = {
  prompt: string;
  options: string[];
  confirmLabel: string;
  minSelect: number;
  catColor: string;
  accentColors?: string[];
  onComplete: (collectedText: string) => void;
};

export default function MultiSelect({
  prompt,
  options,
  confirmLabel,
  minSelect,
  catColor,
  accentColors,
  onComplete,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [fade]);

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const canConfirm = selected.size >= minSelect;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const lines = options
      .map((opt, i) => (selected.has(i) ? `• ${opt}` : null))
      .filter((s): s is string => Boolean(s));
    const collected = lines.length ? `${prompt}\n\n${lines.join('\n')}` : prompt;
    onComplete(collected);
  };

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      <Text style={[styles.prompt, { color: catColor }]}>{prompt}</Text>
      <ScrollView
        style={styles.listArea}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {options.map((option, i) => {
          const isSel = selected.has(i);
          const stripe = pickMacColor(accentColors, catColor, i);
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              onPress={() => toggle(i)}
              style={[
                styles.option,
                { borderLeftColor: stripe },
                isSel && {
                  borderColor: stripe,
                  backgroundColor: stripe + '14',
                },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  isSel && { backgroundColor: stripe, borderColor: stripe },
                ]}
              >
                {isSel ? (
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                ) : null}
              </View>
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity
        style={[styles.btn, !canConfirm && styles.btnDisabled]}
        onPress={handleConfirm}
        disabled={!canConfirm}
      >
        <Text style={styles.btnText}>
          {canConfirm
            ? confirmLabel
            : `Select ${minSelect - selected.size} more`}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  prompt: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  listArea: { flex: 1, width: '100%' },
  listContent: { paddingVertical: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  optionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
    marginTop: spacing.md,
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
