import { useEffect, useMemo, useRef, useState } from 'react';
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

type Field = {
  label: string;
  input?: boolean;
  placeholder?: string;
};

type Props = {
  header: string;
  fields: Field[];
  submitLabel: string;
  summaryHeader?: string;
  continueLabel: string;
  catColor: string;
  accentColors?: string[];
  onComplete: (collectedText: string) => void;
};

export default function MultiFieldEntry({
  header,
  fields,
  submitLabel,
  summaryHeader,
  continueLabel,
  catColor,
  accentColors,
  onComplete,
}: Props) {
  const [answers, setAnswers] = useState<string[]>(() => Array(fields.length).fill(''));
  const [showSummary, setShowSummary] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const footerRef = useRef<View>(null);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade, showSummary]);

  const collectedText = useMemo(() => {
    const lines = fields
      .map((field, idx) => {
        const answer = (answers[idx] ?? '').trim();
        if (field.input === false) return field.label;
        return answer ? `${field.label}\n${answer}` : '';
      })
      .filter(Boolean);
    return [header, ...lines].join('\n\n');
  }, [answers, fields, header]);

  const save = () => {
    if (summaryHeader) {
      setShowSummary(true);
      return;
    }
    onComplete(collectedText);
  };

  const updateAnswer = (idx: number, text: string) => {
    setAnswers((prev) => {
      const next = prev.slice();
      next[idx] = text;
      return next;
    });
  };

  if (showSummary) {
    return (
      <Animated.View style={[styles.container, styles.centered, { opacity: fade }]}>
        <Text style={[styles.header, { color: catColor }]}>{summaryHeader}</Text>
        <View style={styles.summaryCard}>
          {fields.map((field, idx) => {
            const answer = (answers[idx] ?? '').trim();
            const stripe = pickMacColor(accentColors, catColor, idx);
            return (
              <View key={`${field.label}-${idx}`} style={[styles.summaryItem, { borderLeftColor: stripe }]}>
                <Text style={styles.summaryLabel}>{field.label}</Text>
                {field.input === false ? null : (
                  <Text style={styles.summaryAnswer}>{answer || 'Not entered'}</Text>
                )}
              </View>
            );
          })}
        </View>
        <TouchableOpacity style={styles.btn} onPress={() => onComplete(collectedText)}>
          <Text style={styles.btnText}>{continueLabel}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        <Text style={[styles.header, { color: catColor }]}>{header}</Text>
        {fields.map((field, idx) => {
          const stripe = pickMacColor(accentColors, catColor, idx);
          return (
            <View key={`${field.label}-${idx}`} style={[styles.fieldCard, { borderLeftColor: stripe }]}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              {field.input === false ? null : (
                <TextInput
                  style={styles.textInput}
                  placeholder={field.placeholder ?? 'Write your answer...'}
                  placeholderTextColor={colors.textMuted}
                  value={answers[idx] ?? ''}
                  onChangeText={(text) => updateAnswer(idx, text)}
                  multiline
                  scrollEnabled={false}
                  autoCorrect
                  spellCheck
                  onFocus={() => scheduleScrollFooterAboveKeyboard(scrollRef, footerRef, scrollYRef)}
                  onContentSizeChange={() => scheduleScrollFooterAboveKeyboard(scrollRef, footerRef, scrollYRef)}
                />
              )}
            </View>
          );
        })}
        <View ref={footerRef} collapsable={false}>
          <TouchableOpacity style={styles.btn} onPress={save}>
            <Text style={styles.btnText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  centered: {
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 26,
  },
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  btn: {
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
    marginTop: spacing.md,
  },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  summaryItem: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  summaryAnswer: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
  },
});
