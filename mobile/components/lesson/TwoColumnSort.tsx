import { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';

type ColDef = { id: string; label: string };

type Props = {
  columns: ColDef[];
  minPerColumn: number;
  closeColumnId: string;
  actionPrompt: string;
  catColor: string;
  onComplete: (collectedText: string) => void;
};

export default function TwoColumnSort({
  columns,
  minPerColumn,
  closeColumnId,
  actionPrompt,
  catColor,
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={60}
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
                />
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: catColor }]} onPress={addEntry}>
                  <Ionicons name="add" size={24} color={colors.white} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.btn, !meetsMin && styles.btnDisabled]}
                onPress={finishEntry}
                disabled={!meetsMin}
              >
                <Text style={styles.btnText}>Continue</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    );
  }

  const currentItem = openItems[actionIndex];
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={60}
    >
      <Animated.View style={[styles.container, { opacity: fade }]}>
        <View style={styles.dots}>
          {openItems.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === actionIndex
                  ? { backgroundColor: catColor, width: 18 }
                  : i < actionIndex
                    ? { backgroundColor: catColor + '60' }
                    : { backgroundColor: colors.ringTrack },
              ]}
            />
          ))}
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
        />
        <TouchableOpacity style={styles.btn} onPress={submitAction}>
          <Text style={styles.btnText}>
            {actionIndex >= openItems.length - 1 ? 'Finish' : 'Next'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
