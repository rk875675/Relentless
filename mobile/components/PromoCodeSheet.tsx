import { useEffect, useRef, useState } from 'react';
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
import {
  clearPendingReferralClaim,
  savePendingReferralClaim,
  type PendingReferralClaim,
} from '@/lib/referral-claim-state';
import {
  claimReferralCode,
  isReferralEnabled,
  looksLikeOfferCode,
  presentAppleOfferCodeSheet,
  type ReferralCadence,
  type ReferralClaimErrorCode,
} from '@/lib/referral';
import { restorePurchasesViaStoreKit } from '@/lib/iap-restore';
import { colors, spacing } from '@/lib/theme';

// ---------------------------------------------------------------------------
// HUMAN INPUT NEEDED — placeholder copy. Every user-facing string for the
// promo-code sheet lives in this one block; review/replace before release.
//
// The referral strings below are additionally constrained by PRD 10.5.9: they
// must anchor on the teammate's first payment rather than trial completion,
// must say the discount covers one billing period and then returns to full
// price, and must never say "this month" to someone who may be on annual.
// No discount percentage is stated anywhere here on purpose — "20% off" may
// only be shown once the configured App Store price points are confirmed to
// be at least 20% below list.
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
  // --- referral path ---
  cadenceTitle: 'Choose your plan',
  cadenceMonthly: 'Monthly',
  cadenceAnnual: 'Annual',
  cadenceBack: 'Back',
  redeemTitle: 'Redeem in the App Store',
  redeemInstructions:
    'Enter this code on the next screen to start your subscription. Press and hold to copy it.',
  redeemOpen: 'Continue',
  redeemDone: 'Done',
  referralUnavailable: 'This offer is temporarily unavailable. Please try again later.',
  referralSelfShare: 'You cannot use your own invite.',
  referralAlreadyReceived: 'This account has already used a referral offer.',
};

/** Which pane of the sheet is showing. Entry is the only creator-path pane. */
type Step = 'entry' | 'cadence' | 'redeem';

function referralErrorCopy(code: ReferralClaimErrorCode): string {
  switch (code) {
    case 'SELF_SHARE':
    case 'RECIPROCITY_BLOCKED':
      return COPY.referralSelfShare;
    case 'ALREADY_RECEIVED':
      return COPY.referralAlreadyReceived;
    case 'POOL_UNAVAILABLE':
      return COPY.referralUnavailable;
    case 'NETWORK':
      return COPY.network;
    // INVALID_CODE, FEATURE_DISABLED and RATE_LIMITED all collapse into the
    // generic error so the sheet never reveals which code system was probed,
    // or that a referral system exists at all (PRD 10.5.7).
    default:
      return COPY.invalid;
  }
}

type PromoCodeSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Signed-in path: the code was redeemed server-side; refresh state + route. */
  onRedeemed: () => void;
  /** Pre-auth path: the code was validated and stashed; continue to signup. */
  onValidatedPreAuth: (validated: ValidatedPromoCode) => void;
  /**
   * Pre-auth referral path: the code and cadence are stashed, but claiming
   * needs an account first. The paywall routes to signup, WITHOUT the
   * post-paywall flow — that one demands a verified purchase, and this user
   * has not bought anything yet.
   */
  onReferralPreAuth?: () => void;
  /**
   * Set when the paywall reopens the sheet after signup to finish a stashed
   * referral claim. Sends the sheet straight to the claim step.
   */
  resumeReferral?: PendingReferralClaim | null;
};

export function PromoCodeSheet({
  visible,
  onClose,
  onRedeemed,
  onValidatedPreAuth,
  onReferralPreAuth,
  resumeReferral,
}: PromoCodeSheetProps) {
  const { session } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>('entry');
  const [issuedCode, setIssuedCode] = useState('');

  const reset = () => {
    setCode('');
    setBusy(false);
    setError('');
    setStep('entry');
    setIssuedCode('');
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  // Resuming after signup: the code and cadence were chosen before the account
  // existed, so claim now rather than making the user type it a second time.
  const resumeStarted = useRef(false);
  useEffect(() => {
    if (!visible || !resumeReferral || !session || resumeStarted.current) return;
    resumeStarted.current = true;
    setCode(resumeReferral.code);
    void handleCadence(resumeReferral.cadence, resumeReferral.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resumeReferral, session]);

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');

    const validated = await validatePromoCode(trimmed);
    if (!validated.ok) {
      // Creator codes take precedence and their path is unchanged (PRD
      // 10.5.10). Only a string the creator system does not recognize is
      // offered to the referral system, and the two are told apart by which
      // table owns the code rather than by inspecting the string — creator
      // codes have no reserved format, so no prefix or length test would be
      // safe.
      if (
        validated.reason === 'invalid' &&
        looksLikeOfferCode(trimmed) &&
        (session || onReferralPreAuth) &&
        (await isReferralEnabled())
      ) {
        setBusy(false);
        // The invitee picks a plan before redemption, and is always issued a
        // code for the current live SKU for that cadence (PRD 10.5.4).
        setStep('cadence');
        return;
      }
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

  // -------------------------------------------------------------------------
  // Referral path (PRD 10.5.4)
  // -------------------------------------------------------------------------

  const handleCadence = async (cadence: ReferralCadence, codeOverride?: string) => {
    if (busy) return;
    const entered = (codeOverride ?? code).trim();
    if (!entered) return;

    // No account yet: the claim has to wait, because binding the code to a
    // user is what makes attribution work at all.
    if (!session) {
      await savePendingReferralClaim({
        code: entered,
        cadence,
        savedAt: new Date().toISOString(),
      });
      reset();
      onReferralPreAuth?.();
      return;
    }

    setBusy(true);
    setError('');

    const claimed = await claimReferralCode(entered, cadence);
    setBusy(false);

    if (!claimed.ok) {
      // A stashed claim that the server rejects must not follow the user
      // around; they can re-enter a code from here.
      void clearPendingReferralClaim();
      setError(referralErrorCopy(claimed.errorCode));
      setStep('entry');
      return;
    }

    void clearPendingReferralClaim();

    // Not necessarily the string they typed: choosing the other cadence
    // issues the code for that plan instead, so the redeem pane has to show
    // whatever the server actually bound.
    setIssuedCode(claimed.code);
    setStep('redeem');
  };

  const handlePresentRedemption = async () => {
    if (busy) return;
    setBusy(true);
    await presentAppleOfferCodeSheet();
    // Apple neither reports whether the user redeemed nor which code was
    // used, so this only syncs whatever StoreKit now has. The reward itself
    // is released server-side from Apple's notification, never from here.
    await restorePurchasesViaStoreKit().catch(() => undefined);
    setBusy(false);
    reset();
    onRedeemed();
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
            {step === 'cadence' ? (
              <>
                <Text style={styles.title}>{COPY.cadenceTitle}</Text>

                {(['monthly', 'annual'] as const).map((cadence) => (
                  <TouchableOpacity
                    key={cadence}
                    style={[styles.button, styles.cadenceButton, busy && styles.buttonDisabled]}
                    onPress={() => {
                      void handleCadence(cadence);
                    }}
                    disabled={busy}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>
                      {cadence === 'monthly' ? COPY.cadenceMonthly : COPY.cadenceAnnual}
                    </Text>
                  </TouchableOpacity>
                ))}

                {busy ? <ActivityIndicator color={colors.white} style={styles.spinner} /> : null}

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    if (!busy) setStep('entry');
                  }}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelText}>{COPY.cadenceBack}</Text>
                </TouchableOpacity>
              </>
            ) : step === 'redeem' ? (
              <>
                <Text style={styles.title}>{COPY.redeemTitle}</Text>

                {/* Apple's redemption sheet cannot be pre-filled, so the code
                    has to be readable and copyable here. */}
                <Text style={styles.issuedCode} selectable>
                  {issuedCode}
                </Text>

                <Text style={styles.instructions}>{COPY.redeemInstructions}</Text>

                <TouchableOpacity
                  style={[styles.button, busy && styles.buttonDisabled]}
                  onPress={() => {
                    void handlePresentRedemption();
                  }}
                  disabled={busy}
                  activeOpacity={0.85}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.buttonText}>{COPY.redeemOpen}</Text>
                  )}
                </TouchableOpacity>

                {/* Closing here is safe: the code stays bound to this account,
                    so re-entering it resolves to the same invite. */}
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleClose}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelText}>{COPY.redeemDone}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
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
              </>
            )}
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
  cadenceButton: { marginBottom: spacing.md },
  spinner: { marginTop: spacing.sm },
  issuedCode: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  instructions: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  cancelBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: { color: colors.textMuted, fontSize: 14 },
});
