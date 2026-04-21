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
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';
import { scheduleScrollFooterAboveKeyboard } from '@/lib/schedule-scroll-for-keyboard';
import { pickMacColor } from '@/lib/mac-categories';

type Props = {
  entryInstruction: string;
  entryDoneLabel: string;
  discardInstruction: string;
  canRestore: boolean;
  actionPrompt: string;
  catColor: string;
  accentColors?: string[];
  onComplete: (collectedText: string) => void;
};

type Bubble = { id: number; text: string; active: boolean };

export default function BubbleSort({
  entryInstruction,
  entryDoneLabel,
  discardInstruction,
  canRestore,
  actionPrompt,
  catColor,
  accentColors,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'entry' | 'discard' | 'action'>('entry');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [lastPopped, setLastPopped] = useState<number | null>(null);
  const [actionIndex, setActionIndex] = useState(0);
  const [actionText, setActionText] = useState('');
  const [actionEntries, setActionEntries] = useState<string[]>([]);
  const nextId = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;
  const entryScrollRef = useRef<ScrollView>(null);
  const entryScrollYRef = useRef(0);
  const entryFooterRef = useRef<View>(null);
  const actionScrollRef = useRef<ScrollView>(null);
  const actionScrollYRef = useRef(0);
  const actionFooterRef = useRef<View>(null);

  useEffect(() => {
    if (phase === 'entry') entryScrollYRef.current = 0;
  }, [phase]);
  useEffect(() => {
    if (phase === 'action') actionScrollYRef.current = 0;
  }, [phase]);

  const addBubble = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBubbles((prev) => [...prev, { id: nextId.current++, text: trimmed, active: true }]);
    setText('');
  };

  const finishEntry = () => {
    if (bubbles.length === 0) return;
    setPhase('discard');
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const popBubble = (id: number) => {
    setLastPopped(id);
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, active: false } : b)));
  };

  const restoreLast = () => {
    if (lastPopped === null) return;
    setBubbles((prev) => prev.map((b) => (b.id === lastPopped ? { ...b, active: true } : b)));
    setLastPopped(null);
  };

  const finishDiscard = () => {
    const remaining = bubbles.filter((b) => b.active);
    if (remaining.length === 0) {
      onComplete('');
      return;
    }
    setActionIndex(0);
    setActionText('');
    setActionEntries([]);
    setPhase('action');
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const submitAction = () => {
    const answer = actionText.trim();
    const remaining = bubbles.filter((b) => b.active);
    const newEntries = [...actionEntries, answer];
    setActionEntries(newEntries);

    const next = actionIndex + 1;
    if (next >= remaining.length) {
      const collectedText = remaining
        .map((b, i) => `Worry: ${b.text}\nNext step: ${newEntries[i] ?? ''}`)
        .join('\n\n');
      onComplete(collectedText);
      return;
    }
    setActionIndex(next);
    setActionText('');
  };

  const activeBubbles = bubbles.filter((b) => b.active);

  if (phase === 'entry') {
    return (
      <View style={styles.keyboardRoot}>
        <ScrollView
          ref={entryScrollRef}
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={styles.entryOuterScrollContent}
          onScroll={(e) => {
            entryScrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Text style={[styles.instruction, { color: catColor }]}>{entryInstruction}</Text>
          <ScrollView
            style={styles.bubbleArea}
            contentContainerStyle={styles.bubbleWrap}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {bubbles.map((b) => (
              <View key={b.id} style={[styles.bubble, { borderColor: catColor }]}>
                <Text style={styles.bubbleText}>{b.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.entryInput}
              placeholder="Type a worry..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              onSubmitEditing={addBubble}
              returnKeyType="done"
              blurOnSubmit={false}
              onFocus={() =>
                scheduleScrollFooterAboveKeyboard(entryScrollRef, entryFooterRef, entryScrollYRef)
              }
            />
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: catColor }]} onPress={addBubble}>
              <Ionicons name="add" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View ref={entryFooterRef} collapsable={false}>
            <TouchableOpacity
              style={[styles.btn, bubbles.length === 0 && styles.btnDisabled]}
              onPress={finishEntry}
              disabled={bubbles.length === 0}
            >
              <Text style={styles.btnText}>{entryDoneLabel}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (phase === 'discard') {
    return (
      <Animated.View style={[styles.container, { opacity: fade }]}>
        <Text style={[styles.instruction, { color: catColor }]}>{discardInstruction}</Text>
        <ScrollView
          style={styles.bubbleArea}
          contentContainerStyle={styles.bubbleWrap}
          showsVerticalScrollIndicator={false}
        >
          {bubbles.filter((b) => b.active).map((b) => (
            <TouchableOpacity key={b.id} onPress={() => popBubble(b.id)}>
              <View style={[styles.bubble, { borderColor: catColor }]}>
                <Text style={styles.bubbleText}>{b.text}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.discardActions}>
          {canRestore && lastPopped !== null ? (
            <TouchableOpacity style={styles.restoreBtn} onPress={restoreLast}>
              <Ionicons name="arrow-undo" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.restoreBtnSpacer} />
          )}
          <View style={styles.discardActionsFlex} />
          <TouchableOpacity style={styles.btn} onPress={finishDiscard}>
            <Text style={styles.btnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  const currentBubble = activeBubbles[actionIndex];
  return (
    <View style={styles.keyboardRoot}>
      <Animated.View style={{ flex: 1, width: '100%', opacity: fade }}>
        <ScrollView
          ref={actionScrollRef}
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={styles.actionScrollContent}
          onScroll={(e) => {
            actionScrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.dots}>
            {activeBubbles.map((_, i) => {
              const stripe = pickMacColor(accentColors, catColor, i);
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === actionIndex
                      ? { backgroundColor: stripe, width: 18 }
                      : i < actionIndex
                        ? { backgroundColor: stripe + '60' }
                        : { backgroundColor: colors.ringTrack },
                  ]}
                />
              );
            })}
          </View>
          <View style={[styles.card, { borderColor: catColor, borderTopWidth: 2 }]}>
            <Text style={styles.cardLabel}>{currentBubble?.text}</Text>
          </View>
          <Text style={styles.actionPromptText}>{actionPrompt}</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Write your next step..."
            placeholderTextColor={colors.textMuted}
            value={actionText}
            onChangeText={setActionText}
            multiline
            scrollEnabled={false}
            onFocus={() =>
              scheduleScrollFooterAboveKeyboard(actionScrollRef, actionFooterRef, actionScrollYRef)
            }
            onContentSizeChange={() =>
              scheduleScrollFooterAboveKeyboard(actionScrollRef, actionFooterRef, actionScrollYRef)
            }
          />
          <View ref={actionFooterRef} collapsable={false}>
            <TouchableOpacity style={styles.btn} onPress={submitAction}>
              <Text style={styles.btnText}>
                {actionIndex >= activeBubbles.length - 1 ? 'Finish' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  entryOuterScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  actionScrollContent: {
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
  instruction: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  bubbleArea: { flex: 1, width: '100%' },
  bubbleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bubbleText: { color: colors.textPrimary, fontSize: 14, fontWeight: '500' },
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
  discardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.sm,
  },
  discardActionsFlex: {
    flex: 1,
    minWidth: spacing.md,
  },
  restoreBtnSpacer: {
    width: 48,
    height: 48,
  },
  restoreBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  dot: { height: 4, width: 8, borderRadius: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 28,
    paddingHorizontal: spacing.xl,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  actionPromptText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 100,
    width: '100%',
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
});
