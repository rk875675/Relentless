import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing } from '@/lib/theme';

type PromptCardItem = { intro_hold_seconds: number; prompt: string; min_entry_seconds: number };

type Props = {
  cards: PromptCardItem[];
  catColor: string;
  onComplete: (collectedText: string) => void;
};

export default function PromptCards({ cards, catColor, onComplete }: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'entry'>('intro');
  const [entries, setEntries] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [canAdvance, setCanAdvance] = useState(false);
  const textRef = useRef('');

  const fade = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { textRef.current = text; }, [text]);

  useEffect(() => {
    return () => { if (holdTimer.current) clearTimeout(holdTimer.current); };
  }, []);

  const startIntro = useCallback((idx: number) => {
    setCanAdvance(false);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    const card = cards[idx];
    if (!card) return;
    holdTimer.current = setTimeout(() => setCanAdvance(true), card.intro_hold_seconds * 1000);
  }, [cards, fade]);

  useEffect(() => { startIntro(0); }, [startIntro]);

  const flipToEntry = () => {
    if (!canAdvance) return;
    setCanAdvance(false);
    setPhase('entry');
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    const card = cards[cardIndex];
    holdTimer.current = setTimeout(() => setCanAdvance(true), card.min_entry_seconds * 1000);
  };

  const nextCard = () => {
    if (!canAdvance) return;
    const answer = textRef.current.trim();
    const newEntries = [...entries, answer];
    setEntries(newEntries);

    const nextIdx = cardIndex + 1;
    if (nextIdx >= cards.length) {
      const collectedText = cards
        .map((c, i) => `${c.prompt}\n${newEntries[i] ?? ''}`)
        .join('\n\n');
      onComplete(collectedText);
      return;
    }

    setText('');
    setCardIndex(nextIdx);
    setPhase('intro');
    startIntro(nextIdx);
  };

  const card = cards[cardIndex];

  const dots = (
    <View style={styles.dots}>
      {cards.map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === cardIndex
              ? { backgroundColor: catColor, width: 18 }
              : i < cardIndex
                ? { backgroundColor: catColor + '60' }
                : { backgroundColor: colors.ringTrack },
          ]}
        />
      ))}
    </View>
  );

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      {phase === 'intro' && (
        <>
          {dots}
          <View style={[styles.card, { borderColor: catColor, borderTopWidth: 2 }]}>
            <Text style={styles.cardPrompt}>{card.prompt}</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, !canAdvance && styles.btnDisabled]}
            onPress={flipToEntry}
            disabled={!canAdvance}
          >
            <Text style={styles.btnText}>Start Writing</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'entry' && (
        <KeyboardAvoidingView
          style={{ flex: 1, width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={60}
        >
          <View style={styles.entryInner}>
            {dots}
            <Text style={styles.entryPrompt}>{card.prompt}</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Write your answer..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              autoCorrect
              spellCheck
              autoFocus
            />
            <TouchableOpacity
              style={[styles.btn, !canAdvance && styles.btnDisabled]}
              onPress={nextCard}
              disabled={!canAdvance}
            >
              <Text style={styles.btnText}>
                {cardIndex >= cards.length - 1 ? 'Finish' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.lg,
  },
  dot: { height: 4, width: 8, borderRadius: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 36,
    paddingHorizontal: spacing.xl,
    width: '100%',
    minHeight: 156,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  cardPrompt: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 28,
  },
  entryInner: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  entryPrompt: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.md,
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
  btnDisabled: { opacity: 0.35 },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
