import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { analytics } from '@/lib/analytics';
import {
  redeemPromoCode,
  validatePromoCode,
  type ValidatedPromoCode,
} from '@/lib/promo-codes';
import { savePendingPromoCode } from '@/lib/promo-code-state';
import { colors, spacing } from '@/lib/theme';

// ---------------------------------------------------------------------------
// HUMAN INPUT NEEDED — placeholder copy. Every user-facing string for the
// promo-code sheet lives in this one block; review/replace before release.
// ---------------------------------------------------------------------------
const COPY = {
  title: 'Enter your code',
  placeholder: 'Code',
  submit: 'Apply code',
  cancel: 'Cancel',
  invalid: 'This code is not valid.',
  network: 'Could not check your code. Please try again.',
  alreadyUsed: 'This code has already been used.',
  alreadyEntitled: 'You already have an active subscription.',
  redeemFailed: 'Could not redeem your code. Please try again.',
};

type PromoCodeSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Signed-in path: the code was redeemed server-side; refresh state + route. */
  onRedeemed: () => void;
  /** Pre-auth path: the code was validated and stashed; continue to signup. */
  onValidatedPreAuth: (validated: ValidatedPromoCode) => void;
};

export function PromoCodeSheet({
  visible,
  onClose,
  onRedeemed,
  onValidatedPreAuth,
}: PromoCodeSheetProps) {
  const { session } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setCode('');
    setBusy(false);
    setError('');
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');

    const validated = await validatePromoCode(trimmed);
    if (!validated.ok) {
      setError(validated.reason === 'invalid' ? COPY.invalid : COPY.network);
      setBusy(false);
      return;
    }

    // Client-side capture (works pre-auth; merges into the person on identify)
    // — this is the first step of the Phase 2 creator funnel.
    analytics.capture('promo_code_validated', {
      promo_code: validated.data.code,
      promo_creator: validated.data.creator.slug,
      promo_code_type: validated.data.type,
      promo_months: validated.data.months,
    });

    if (session) {
      const redeemed = await redeemPromoCode(validated.data.code);
      setBusy(false);
      if (!redeemed.ok) {
        setError(
          redeemed.errorCode === 'CODE_FULLY_REDEEMED'
            ? COPY.alreadyUsed
            : redeemed.errorCode === 'ALREADY_ENTITLED'
              ? COPY.alreadyEntitled
              : redeemed.errorCode === 'INVALID_CODE'
                ? COPY.invalid
                : redeemed.error ?? COPY.redeemFailed,
        );
        return;
      }
      reset();
      onRedeemed();
      return;
    }

    await savePendingPromoCode({
      code: validated.data.code,
      type: validated.data.type,
      months: validated.data.months,
      creatorName: validated.data.creator.name,
      creatorSlug: validated.data.creator.slug,
      validatedAt: new Date().toISOString(),
    });
    setBusy(false);
    reset();
    onValidatedPreAuth(validated.data);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
        >
          {/* Stop backdrop-press from closing when tapping the card itself. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{COPY.title}</Text>

            <TextInput
              style={styles.input}
              placeholder={COPY.placeholder}
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={(v) => {
                setCode(v);
                if (error) setError('');
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              autoFocus
              editable={!busy}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, (busy || !code.trim()) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={busy || !code.trim()}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>{COPY.submit}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleClose}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>{COPY.cancel}</Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  avoider: { width: '100%' },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.background,
    color: colors.white,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  cancelBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: { color: colors.textMuted, fontSize: 14 },
});
