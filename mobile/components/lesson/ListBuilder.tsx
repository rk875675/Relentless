import { useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';
import { scheduleScrollFooterAboveKeyboard } from '@/lib/schedule-scroll-for-keyboard';
import { pickMacColor } from '@/lib/mac-categories';

// `minEntrySeconds` and `summaryHoldSeconds` remain in the prop shape so the
// player keeps passing them, but the component no longer enforces dwell time —
// the user paces themselves, matching the rest of the lesson UX.
type Props = {
  prompts: string[];
  minEntries: number;
  minEntrySeconds: number;
  summaryHeader: string;
  summaryHoldSeconds: number;
  catColor: string;
  accentColors?: string[];
  onComplete: (collectedText: string) => void;
};

export default function ListBuilder({
  prompts,
  minEntries,
  summaryHeader,
  catColor,
  accentColors,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'entry' | 'summary'>('entry');
  const [entries, setEntries] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const entryScrollRef = useRef<ScrollView>(null);
  const entryScrollYRef = useRef(0);
  const entryFooterRef = useRef<View>(null);

  const addEntry = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newEntries = [...entries, trimmed];
    setEntries(newEntries);
    setText('');
    setPromptIndex((i) => Math.min(i + 1, prompts.length - 1));
  };

  const finish = () => {
    if (entries.length < minEntries) return;
    setPhase('summary');
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const handleContinue = () => {
    const collectedText = entries.map((e) => `• ${e}`).join('\n');
    onComplete(collectedText);
  };

  if (phase === 'summary') {
    return (
      <Animated.View style={[styles.container, { opacity: fade }]}>
        <Text style={[styles.summaryHeader, { color: catColor }]}>{summaryHeader}</Text>
        <ScrollView
          contentContainerStyle={styles.summaryScroll}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, width: '100%' }}
        >
          {entries.map((entry, i) => (
            <View
              key={i}
              style={[
                styles.summaryItem,
                { borderLeftColor: pickMacColor(accentColors, catColor, i) },
              ]}
            >
              <Text style={styles.summaryText}>{entry}</Text>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.btn} onPress={handleContinue}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={styles.entryKeyboardRoot}>
      <ScrollView
        ref={entryScrollRef}
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={styles.entryScrollContent}
        onScroll={(e) => {
          entryScrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.prompt, { color: catColor }]}>
          {prompts[promptIndex] ?? prompts[prompts.length - 1]}
        </Text>
        {entries.map((entry, i) => (
          <Animated.View
            key={i}
            style={[
              styles.entryItem,
              { borderLeftColor: pickMacColor(accentColors, catColor, i) },
            ]}
          >
            <Text style={styles.entryText}>{entry}</Text>
          </Animated.View>
        ))}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.entryInput}
            placeholder="Write your answer..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={addEntry}
            returnKeyType="done"
            blurOnSubmit={false}
            onFocus={() =>
              scheduleScrollFooterAboveKeyboard(entryScrollRef, entryFooterRef, entryScrollYRef)
            }
          />
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: catColor }]}
            onPress={addEntry}
          >
            <Ionicons name="add" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
        <View ref={entryFooterRef} collapsable={false}>
          <TouchableOpacity
            style={[styles.btn, entries.length < minEntries && styles.btnDisabled]}
            onPress={finish}
            disabled={entries.length < minEntries}
          >
            <Text style={styles.btnText}>
              {entries.length < minEntries
                ? `Add ${minEntries - entries.length} more`
                : "I'm done"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  entryKeyboardRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  entryScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
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
  entryItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    width: '100%',
  },
  entryText: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: spacing.md,
  },
  entryInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  summaryHeader: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  summaryScroll: { paddingBottom: spacing.md },
  summaryItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  summaryText: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 26,
  },
});
