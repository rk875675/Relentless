import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing } from '@/lib/theme';
import { scheduleScrollFooterAboveKeyboard } from '@/lib/schedule-scroll-for-keyboard';
import { pickMacColor } from '@/lib/mac-categories';

// Examples shown above a multiline text input. Single Save advances. No
// time-locks or countdowns — Save is always enabled (empty submissions are
// allowed; the app will skip empty journal context per the lesson player).
type Props = {
  examplesHeader: string;
  examples: string[];
  inputPrompt: string;
  submitLabel: string;
  catColor: string;
  accentColors?: string[];
  onComplete: (collectedText: string) => void;
};

export default function ExamplesWithEntry({
  examplesHeader,
  examples,
  inputPrompt,
  submitLabel,
  catColor,
  accentColors,
  onComplete,
}: Props) {
  const [text, setText] = useState('');
  const fade = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const footerRef = useRef<View>(null);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [fade]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    const collected = trimmed ? `${inputPrompt}\n${trimmed}` : '';
    onComplete(collected);
  };

  return (
    <Animated.View style={[styles.outer, { opacity: fade }]}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {examplesHeader ? (
          <Text style={[styles.header, { color: catColor }]}>{examplesHeader}</Text>
        ) : null}
        {examples.map((ex, i) => (
          <View
            key={i}
            style={[
              styles.exampleItem,
              { borderLeftColor: pickMacColor(accentColors, catColor, i) },
            ]}
          >
            <Text style={styles.exampleText}>{ex}</Text>
          </View>
        ))}
        <Text style={styles.inputPrompt}>{inputPrompt}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Write your answer..."
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          scrollEnabled={false}
          autoCorrect
          spellCheck
          onFocus={() => scheduleScrollFooterAboveKeyboard(scrollRef, footerRef, scrollYRef)}
          onContentSizeChange={() =>
            scheduleScrollFooterAboveKeyboard(scrollRef, footerRef, scrollYRef)
          }
        />
        <View ref={footerRef} collapsable={false}>
          <TouchableOpacity style={styles.btn} onPress={handleSubmit}>
            <Text style={styles.btnText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  header: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  exampleItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    width: '100%',
  },
  exampleText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  inputPrompt: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 120,
    width: '100%',
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
  },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
