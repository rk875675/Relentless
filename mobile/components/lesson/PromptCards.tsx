import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';
import { scheduleScrollFooterAboveKeyboard } from '@/lib/schedule-scroll-for-keyboard';
import { pickMacColor } from '@/lib/mac-categories';

// `intro_hold_seconds` and `min_entry_seconds` remain on the data shape so
// existing content JSON keeps validating, but the player no longer enforces
// them — the user paces the cards themselves with Back/Next.
export type PromptJournalLink =
  | { kind: 'program_day'; program_day: number }
  | { kind: 'session_entries' };

type PromptCardItem = {
  intro_hold_seconds: number;
  prompt: string;
  min_entry_seconds: number;
  journal_link?: PromptJournalLink;
};

type Props = {
  cards: PromptCardItem[];
  catColor: string;
  accentColors?: string[];
  /** Notifies the parent of the current card index so it can drive the lesson progress bar. */
  onIndexChange?: (index: number) => void;
  onComplete: (collectedText: string) => void;
};

export default function PromptCards({ cards, catColor, accentColors, onIndexChange, onComplete }: Props) {
  const router = useRouter();
  const [cardIndex, setCardIndex] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'entry'>('intro');
  const [entries, setEntries] = useState<string[]>(() => Array(cards.length).fill(''));
  const [text, setText] = useState('');
  const textRef = useRef('');

  const fade = useRef(new Animated.Value(0)).current;
  const entryScrollRef = useRef<ScrollView>(null);
  const entryScrollYRef = useRef(0);
  const entryFooterRef = useRef<View>(null);

  useEffect(() => { textRef.current = text; }, [text]);

  useEffect(() => {
    if (phase === 'entry') entryScrollYRef.current = 0;
  }, [phase]);

  useEffect(() => { onIndexChange?.(cardIndex); }, [cardIndex, onIndexChange]);

  const animateIn = useCallback(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => { animateIn(); }, [animateIn]);

  // Persist the current card's draft into entries[cardIndex].
  const saveCurrentDraft = useCallback(() => {
    const draft = textRef.current;
    setEntries((prev) => {
      if (prev[cardIndex] === draft) return prev;
      const next = prev.slice();
      next[cardIndex] = draft;
      return next;
    });
  }, [cardIndex]);

  const flipToEntry = () => {
    setPhase('entry');
    animateIn();
  };

  const goToCard = useCallback((nextIdx: number, nextPhase: 'intro' | 'entry') => {
    saveCurrentDraft();
    setCardIndex(nextIdx);
    setPhase(nextPhase);
    setText(entries[nextIdx] ?? '');
    animateIn();
  }, [animateIn, entries, saveCurrentDraft]);

  const nextCard = () => {
    saveCurrentDraft();
    const answer = textRef.current;
    const newEntries = entries.slice();
    newEntries[cardIndex] = answer;

    const nextIdx = cardIndex + 1;
    if (nextIdx >= cards.length) {
      const collectedText = cards
        .map((c, i) => {
          const a = (newEntries[i] ?? '').trim();
          return a ? `${c.prompt}\n${a}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
      onComplete(collectedText);
      return;
    }

    setEntries(newEntries);
    setText(newEntries[nextIdx] ?? '');
    setCardIndex(nextIdx);
    setPhase('intro');
    animateIn();
  };

  const goBack = () => {
    if (phase === 'entry') {
      // Back from entry → intro of the same card; preserve typed text.
      saveCurrentDraft();
      setPhase('intro');
      animateIn();
      return;
    }
    if (cardIndex > 0) {
      goToCard(cardIndex - 1, 'entry');
    }
  };

  const card = cards[cardIndex];
  const canGoBack = phase === 'entry' || cardIndex > 0;
  const isLastCard = cardIndex >= cards.length - 1;

  const openJournalLink = (link: PromptJournalLink) => {
    if (link.kind === 'program_day') {
      router.push(`/journal/wod-day/${link.program_day}` as any);
    } else {
      router.push('/journal/session-log' as any);
    }
  };

  const journalLinkLabel =
    card.journal_link?.kind === 'program_day'
      ? `View Day ${card.journal_link.program_day} journal`
      : card.journal_link?.kind === 'session_entries'
        ? 'View evidence log'
        : null;

  const journalLinkButton =
    journalLinkLabel && card.journal_link ? (
      <TouchableOpacity
        style={styles.journalLinkBtn}
        onPress={() => openJournalLink(card.journal_link!)}
        activeOpacity={0.85}
      >
        <Text style={styles.journalLinkBtnText}>{journalLinkLabel}</Text>
      </TouchableOpacity>
    ) : null;

  const dots = (
    <View style={styles.dots}>
      {cards.map((_, i) => {
        const stripe = pickMacColor(accentColors, catColor, i);
        return (
          <View
            key={i}
            style={[
              styles.dot,
              i === cardIndex
                ? { backgroundColor: stripe, width: 18 }
                : i < cardIndex
                  ? { backgroundColor: stripe + '60' }
                  : { backgroundColor: colors.ringTrack },
            ]}
          />
        );
      })}
    </View>
  );

  const backButton = canGoBack ? (
    <TouchableOpacity style={styles.backBtn} onPress={goBack} hitSlop={12}>
      <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
    </TouchableOpacity>
  ) : (
    <View style={styles.backBtnPlaceholder} />
  );

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      {phase === 'intro' && (
        <>
          {dots}
          <View style={[styles.card, { borderColor: catColor, borderTopWidth: 2 }]}>
            <Text style={styles.cardPrompt}>{card.prompt}</Text>
          </View>
          {journalLinkButton}
          <View style={styles.actionRow}>
            {backButton}
            <TouchableOpacity style={[styles.btn, styles.btnInRow]} onPress={flipToEntry}>
              <Text style={styles.btnText}>Start Writing</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {phase === 'entry' && (
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
            {dots}
            <Text style={styles.entryPrompt}>{card.prompt}</Text>
            {journalLinkButton}
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
              autoFocus
              onFocus={() =>
                scheduleScrollFooterAboveKeyboard(entryScrollRef, entryFooterRef, entryScrollYRef)
              }
              onContentSizeChange={() =>
                scheduleScrollFooterAboveKeyboard(entryScrollRef, entryFooterRef, entryScrollYRef)
              }
            />
            <View ref={entryFooterRef} collapsable={false} style={styles.actionRow}>
              {backButton}
              <TouchableOpacity style={[styles.btn, styles.btnInRow]} onPress={nextCard}>
                <Text style={styles.btnText}>{isLastCard ? 'Finish' : 'Next'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
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
  entryKeyboardRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  entryScrollContent: {
    flexGrow: 1,
    alignItems: 'center' as const,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    width: '100%',
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: spacing.md,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
  },
  btnInRow: {
    minWidth: 160,
    paddingHorizontal: 36,
  },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: { width: 48, height: 48 },
  journalLinkBtn: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  journalLinkBtnText: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '700',
  },
});
