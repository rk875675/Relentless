import { useEffect, useRef, useState } from 'react';
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

// Two-phase block. Phase 1: typed entry (Save enabled when non-empty). Phase 2:
// the entered value displayed large with the hold prompt and a Continue button.
// Tap-to-advance both phases — no time-locks, no min-hold.
type Props = {
  entryPrompt: string;
  saveLabel: string;
  holdPrompt: string;
  continueLabel: string;
  catColor: string;
  accentColors?: string[];
  onComplete: (collectedText: string) => void;
};

export default function AnchorEntry({
  entryPrompt,
  saveLabel,
  holdPrompt,
  continueLabel,
  catColor,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'entry' | 'hold'>('entry');
  const [text, setText] = useState('');
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [fade, phase]);

  const trimmed = text.trim();
  const canSave = trimmed.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    setPhase('hold');
  };

  const handleContinue = () => {
    onComplete(`Anchor: ${trimmed}`);
  };

  if (phase === 'entry') {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={60}
      >
        <Animated.View style={[styles.container, { opacity: fade }]}>
          <Text style={[styles.entryPrompt, { color: catColor }]}>{entryPrompt}</Text>
          <TextInput
            style={styles.textInput}
            placeholder="One or two words..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            autoCorrect
            spellCheck
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
            blurOnSubmit
          />
          <TouchableOpacity
            style={[styles.btn, !canSave && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.btnText}>{saveLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Animated.View style={[styles.container, styles.holdContainer, { opacity: fade }]}>
      <View style={styles.anchorBox}>
        <Text style={[styles.anchorWord, { color: catColor }]}>{trimmed}</Text>
      </View>
      <Text style={styles.holdPrompt}>{holdPrompt}</Text>
      <TouchableOpacity style={styles.btn} onPress={handleContinue}>
        <Text style={styles.btnText}>{continueLabel}</Text>
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
  holdContainer: {
    justifyContent: 'center',
  },
  entryPrompt: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    lineHeight: 24,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
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
  anchorBox: {
    width: '100%',
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  anchorWord: {
    fontSize: 44,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  holdPrompt: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
});
