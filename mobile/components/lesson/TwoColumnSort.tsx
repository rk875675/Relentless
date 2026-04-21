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

type ColDef = { id: string; label: string };

type Props = {
  columns: ColDef[];
  minPerColumn: number;
  closeColumnId: string;
  actionPrompt: string;
  catColor: string;
  accentColors?: string[];
  onComplete: (collectedText: string) => void;
};

export default function TwoColumnSort({
  columns,
  minPerColumn,
  closeColumnId,
  actionPrompt,
  catColor,
  accentColors,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'entry' | 'close' | 'action'>('entry');
  const [colEntries, setColEntries] = useState<Record<string, string[]>>(
    Object.fromEntries(columns.map((c) => [c.id, []])),
  );
  const [activeCol, setActiveCol] = useState(columns[0]?.id ?? '');
  const [text, setText] = useState('');
  const [actionIndex, setActionIndex] = useState(0);
  const [actionText, setActionText] = useState('');
  const [actionEntries, setActionEntries] = useState<string[]>([]);

  const closeFade = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const entryScrollRef = useRef<ScrollView>(null);
  const entryScrollYRef = useRef(0);
  const entryFooterRef = useRef<View>(null);
  const actionScrollRef = useRef<ScrollView>(null);
  const actionScrollYRef = useRef(0);
  const actionFooterRef = useRef<View>(null);

  useEffect(() => {
    if (phase === 'action') actionScrollYRef.current = 0;
  }, [phase]);

  const openColumnId = columns.find((c) => c.id !== closeColumnId)?.id ?? '';
  const openItems = colEntries[openColumnId] ?? [];

  const meetsMin = columns.every((c) => (colEntries[c.id]?.length ?? 0) >= minPerColumn);

  const addEntry = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setColEntries((prev) => ({
      ...prev,
      [activeCol]: [...(prev[activeCol] ?? []), trimmed],
    }));
    setText('');
  };

  const finishEntry = () => {
    if (!meetsMin) return;
    setPhase('close');
    Animated.timing(closeFade, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
      setPhase('action');
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  };

  const submitAction = () => {
    const answer = actionText.trim();
    const newEntries = [...actionEntries, answer];
    setActionEntries(newEntries);

    const next = actionIndex + 1;
    if (next >= openItems.length) {
      const collectedText = openItems
        .map((item, i) => `Controllable: ${item}\nNext action: ${newEntries[i] ?? ''}`)
        .join('\n\n');
      onComplete(collectedText);
      return;
    }
    setActionIndex(next);
    setActionText('');
  };

  if (phase === 'entry' || phase === 'close') {
    return (
      <View style={styles.keyboardRoot}>
        <ScrollView
          ref={entryScrollRef}
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={styles.entryOuterScroll}
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
        <View style={styles.container}>
          <View style={styles.columnsRow}>
            {columns.map((col) => {
              const isClosed = phase === 'close' && col.id === closeColumnId;
              const isActive = col.id === activeCol && phase === 'entry';
              return (
                <Animated.View
                  key={col.id}
                  style={[
                    styles.column,
                    isActive && { borderColor: catColor },
                    isClosed && { opacity: closeFade },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.columnTouchable}
                    onPress={() => { if (phase === 'entry') setActiveCol(col.id); }}
                    disabled={phase !== 'entry'}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.colHeader, isActive && { color: catColor }]}>
                      {col.label}
                    </Text>
                    <ScrollView
                      style={styles.colScroll}
                      showsVerticalScrollIndicator={false}
                      scrollEnabled
                      onStartShouldSetResponder={() => false}
                    >
                      {(colEntries[col.id] ?? []).map((item, i) => (
                        <View key={i} style={styles.colItem}>
                          <Text style={styles.colItemText}>{item}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
          {phase === 'entry' && (
            <>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.entryInput}
                  placeholder={`Add to "${columns.find((c) => c.id === activeCol)?.label}"...`}
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
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: catColor }]} onPress={addEntry}>
                  <Ionicons name="add" size={24} color={colors.white} />
                </TouchableOpacity>
              </View>
              <View ref={entryFooterRef} collapsable={false}>
                <TouchableOpacity
                  style={[styles.btn, !meetsMin && styles.btnDisabled]}
                  onPress={finishEntry}
                  disabled={!meetsMin}
                >
                  <Text style={styles.btnText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        </ScrollView>
      </View>
    );
  }

  const currentItem = openItems[actionIndex];
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
          {openItems.map((_, i) => {
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
          <Text style={styles.cardLabel}>{currentItem}</Text>
        </View>
        <Text style={styles.actionPromptText}>{actionPrompt}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Write your next action..."
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
              {actionIndex >= openItems.length - 1 ? 'Finish' : 'Next'}
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
  entryOuterScroll: {
    flexGrow: 1,
    width: '100%',
    paddingBottom: spacing.xl,
  },
  actionScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  columnsRow: {
    flexDirection: 'row',
    flex: 1,
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  column: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  columnTouchable: {
    flex: 1,
    padding: spacing.md,
  },
  colHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  colScroll: { flex: 1 },
  colItem: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  colItemText: { color: colors.textPrimary, fontSize: 13, fontWeight: '500' },
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
