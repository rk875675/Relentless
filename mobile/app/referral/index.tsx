import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth-context';
import {
  applySharerReward,
  createReferralInvite,
  fetchReferralState,
  type ReferralCadence,
  type ReferralInvite,
  type ReferralState,
} from '@/lib/referral';
import { copyText, isClipboardAvailable } from '@/lib/clipboard';
import { ReferralSkeleton } from '@/components/Skeleton';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import {
  trackReferralInviteTabViewed,
  trackReferralShareTapped,
} from '@/lib/referral-analytics';

// App Store Connect app ID — matches ascAppId in mobile/eas.json.
const APP_STORE_URL = 'https://apps.apple.com/app/id6762413686';
const AMBASSADOR_EMAIL = 'admin@relentlessmentaltoughness.com';

// ---------------------------------------------------------------------------
// HUMAN INPUT NEEDED — placeholder copy. Every user-facing string for the
// referral space lives in this one block; review/replace before release.
//
// PRD 10.5.9 constrains these strings: they must anchor on the teammate's
// FIRST PAYMENT rather than trial completion (a previously-expired invitee
// gets no trial).
//
// Rule 3 ("never say 'this month' to someone who may be on annual") is
// satisfied by naming the reader's ACTUAL period: the server reports the
// sharer's cadence, and the invitee has chosen a plan before any of this is
// shown. No string says "billing period".
//
// These strings do NOT state that the price returns to full afterward. That
// is deliberate and matches PRD 10.5.9 as amended 2026-09-12: "20% off your
// first month" carries it, and Apple discloses the real price and renewal
// terms on its own redemption and confirmation screens before any charge.
//
// "20% off" is permitted here because every configured point is at least 20%
// below list (PRD 10.5.9 rule 5): $4.99→$3.99, $39.99→$31.99, $59.99→$47.99,
// and $7.99→$6.39 (20.03%). If any point is ever raised above 0.8 × list, the
// percentage must come out of these strings or become per-SKU.
//
// PRD 10.5.6 additionally forbids stating that the sharer's next charge is
// discounted before Apple has accepted the promotional offer.
// ---------------------------------------------------------------------------
/**
 * The period noun for a cadence, so no user-facing string says "billing
 * period".
 *
 * Falls back to "month" when the server could not determine a cadence, which
 * happens when the viewer has no Apple subscription at all — so they are not
 * an annual subscriber being told the wrong word, and monthly is the current
 * default purchase.
 */
function period(cadence: ReferralCadence | null): string {
  return cadence === 'annual' ? 'year' : 'month';
}

const COPY = {
  title: 'Invite a teammate',

  howTitle: 'How it works',
  // Cadence-aware so no string has to say "billing period". The sharer's own
  // period comes from the server (ReferralState.cadence); the teammate has not
  // chosen a plan yet, so their side stays "their first payment" — which is
  // also the rule-1 anchor.
  howBody: (cadence: ReferralCadence | null) =>
    `Send your invite code. When their first payment goes through, you both get 20% off (your next ${period(cadence)}) and their first payment.`,
  capDisclosure: (cadence: ReferralCadence | null) =>
    `You can earn one reward per ${period(cadence)}. Extra teammates in the same ${period(cadence)} do not add another.`,

  shareCta: 'Share your code',
  yourCodeTitle: 'Your code',
  // The reserved code is for the sharer's own cadence, so this names that
  // period. An invitee who switches plans gets a different code and Apple
  // shows them the real price, so the worst case understates their discount.
  // The code sits alone on its own line so the recipient can long-press it
  // in iMessage to copy without typing the whole thing out.
  shareMessage: (code: string, cadence: ReferralCadence | null) =>
    `I've been training my mental performance on Relentless. Join me and get 20% OFF your first ${period(cadence)}!\n\nYour invite code:\n${code}\n\n${APP_STORE_URL}`,

  invitesTitle: 'Teammates',
  invitesEmpty: 'No one has used your code yet.',
  statusClaimed: 'Waiting on their first payment',
  statusConverted: 'Reward earned',
  // Once the reward this specific invite earned has actually renewed at the
  // discount (not just signed), the card names that instead of the more
  // generic "Reward earned" — a persistent, past-tense confirmation.
  statusConvertedApplied: 'Reward applied',
  chipClaimed: 'Waiting',
  chipConverted: 'Paid',
  chipConvertedApplied: 'Applied',
  claimedTitle: 'Teammate started',
  convertedTitle: 'First payment in',

  rewardTitle: 'Your reward',
  rewardPending: 'Waiting on your teammate’s first payment.',
  rewardReady: 'Your 20% off is ready to apply.',
  rewardApplied: (cadence: ReferralCadence | null) =>
    `Applied. Apple has accepted your 20% off, so your next ${period(cadence)} is discounted.`,
  // Shown once the discounted renewal has already happened (the applied
  // reward's period has passed — rewardApplied above would now be stale,
  // since "your next period" already came and went). Placeholder like the
  // rest of this block; review/replace before release.
  rewardAppliedPast: (cadence: ReferralCadence | null) =>
    `Applied. Invite another teammate to earn 20% off your next ${period(cadence)} again.`,
  applyCta: 'Apply my reward',
  // Rule 4: this fires the moment Apple RECEIVES the offer, so it must stay
  // conditional. Acceptance arrives later on the renewal notification, and
  // rewardApplied above is the only string allowed to state it as done.
  applySubmitted: (cadence: ReferralCadence | null) =>
    `Sent to Apple. Once Apple confirms it, your next ${period(cadence)} is 20% off.`,

  ineligibleSubscription: 'Inviting is available to subscribers on an active plan.',
  // A trial user IS on an active plan, so the string above would mislead them.
  // The sharer must have paid at least once.
  ineligibleTrial: 'Inviting unlocks after your first payment goes through.',
  ineligibleAutoRenewOff:
    'Turn your subscription renewal back on to invite a teammate.',
  ineligibleBilling: 'We could not confirm your subscription with the App Store.',
  ineligibleSlotUsed: (cadence: ReferralCadence | null) =>
    `You have already earned your reward for this ${period(cadence)}. You can invite again next ${period(cadence)}.`,
  ineligibleOfferActive:
    'You already have an offer on your next renewal. Apple allows only one at a time.',
  ineligibleUnavailable: 'Inviting is temporarily unavailable. Please try again later.',

  errorLoad: 'Could not load your invites. Pull down to try again.',
  errorShare: 'Could not create an invite code. Please try again.',
  errorApply: 'Could not apply your reward. Please try again.',
  errorApplyNotActive:
    'Your subscription needs to be active to apply this. Renew, then try again.',
  errorApplyAutoRenew:
    'Turn auto-renew on in your Apple subscription settings, then try again.',
  errorApplyOfferActive:
    'You already have an offer on your next renewal. Apple allows only one at a time.',
  errorApplyAlreadyOwned:
    'Could not attach your 20% off to the plan you already have. Your reward is still saved — this is not lost.',
};

// Covers every Reason the eligibility endpoint can return; the default is the
// set of states that all mean "not a paying subscriber right now".
function ineligibleCopy(reason: string | null, cadence: ReferralCadence | null): string {
  switch (reason) {
    case 'trial_not_paid':
      return COPY.ineligibleTrial;
    case 'auto_renew_off':
      return COPY.ineligibleAutoRenewOff;
    case 'give_slot_used':
      return COPY.ineligibleSlotUsed(cadence);
    case 'renewal_offer_active':
      return COPY.ineligibleOfferActive;
    case 'billing_retry':
    case 'billing_grace':
    case 'apple_unavailable':
      return COPY.ineligibleBilling;
    case 'pool_unavailable':
    case 'feature_disabled':
    case 'unknown_cadence':
      return COPY.ineligibleUnavailable;
    // no_apple_subscription, not_active, revoked, no_original_transaction_id
    default:
      return COPY.ineligibleSubscription;
  }
}

function inviteStatusCopy(invite: ReferralInvite, isAppliedInvite: boolean): string {
  if (invite.status !== 'converted') return COPY.statusClaimed;
  return isAppliedInvite ? COPY.statusConvertedApplied : COPY.statusConverted;
}

function inviteChip(
  invite: ReferralInvite,
  isAppliedInvite: boolean,
): { label: string; tone: 'claimed' | 'converted' } {
  if (invite.status === 'converted') {
    return { label: isAppliedInvite ? COPY.chipConvertedApplied : COPY.chipConverted, tone: 'converted' };
  }
  return { label: COPY.chipClaimed, tone: 'claimed' };
}

function inviteTitle(invite: ReferralInvite): string {
  return invite.status === 'converted' ? COPY.convertedTitle : COPY.claimedTitle;
}

export default function ReferralScreen() {
  const { refreshUserState } = useAuth();
  const [state, setState] = useState<ReferralState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canCopyCode = isClipboardAvailable();

  const load = useCallback(async () => {
    const next = await fetchReferralState();
    if (!next) {
      setError(COPY.errorLoad);
    } else {
      setError('');
      setState(next);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const tabViewed = useRef(false);
  useEffect(() => {
    if (loading || !state || tabViewed.current) return;
    tabViewed.current = true;
    trackReferralInviteTabViewed({
      eligible: state.eligible,
      reason: state.reason,
      cadence: state.cadence,
      has_share_code: !!state.share_code,
      open_invites: state.open_invites,
      reward_status: state.reward?.status ?? null,
    });
  }, [loading, state]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shareCode = async (code: string) => {
    try {
      // Single message: invite text + code on its own line (so the recipient
      // can long-press-select just the code in iMessage) + App Store link.
      // Apple redeem URLs are deliberately not distributed (PRD 10.5.4).
      await Share.share({ message: COPY.shareMessage(code, state?.cadence ?? null) });
    } catch {
      // Dismissed share sheet is not an error.
    }
  };

  const handleShare = async () => {
    if (busy) return;
    let code = state?.share_code ?? null;
    trackReferralShareTapped({
      cadence: state?.cadence ?? null,
      had_code: !!code,
    });
    if (!code) {
      setBusy(true);
      setError('');
      const created = await createReferralInvite();
      setBusy(false);
      if (!created.ok) {
        setError(COPY.errorShare);
        return;
      }
      code = created.code;
      await load();
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await shareCode(code);
  };

  const handleApply = async () => {
    if (busy) return;
    setBusy(true);
    setError('');

    const applied = await applySharerReward();
    setBusy(false);

    if (applied.ok) {
      // Deliberately does not claim the next charge is discounted: that is
      // true only once Apple confirms the offer on the renewal (PRD 10.5.6).
      Alert.alert('', COPY.applySubmitted(state?.cadence ?? null));
      await load();
      void refreshUserState();
      return;
    }

    if (applied.reason === 'cancelled') return;
    if (applied.reason === 'already_applied') {
      await load();
      return;
    }
    const applyMessage =
      applied.reason === 'offer_already_active'
        ? COPY.errorApplyOfferActive
        : applied.reason === 'already_owned'
          ? COPY.errorApplyAlreadyOwned
          : applied.reason === 'not_active'
            ? COPY.errorApplyNotActive
            : applied.reason === 'auto_renew_off'
              ? COPY.errorApplyAutoRenew
              : COPY.errorApply;
    Alert.alert('', applyMessage);
    await load();
  };

  const invites = state?.invites ?? [];
  const shareCodeValue = state?.share_code ?? null;
  const canShare = !!state?.eligible;
  const reward = state?.reward ?? null;
  // An 'applied' reward describes an upcoming discounted renewal only while
  // Apple still reports the offer attached to it (has_active_renewal_offer).
  // Once that renewal actually happens, Apple clears the offer and the
  // reward is history — "your next {period} is discounted" would now be
  // false, so the card below switches to the past-tense confirmation instead
  // (rewardAppliedPast), and the specific teammate card that earned it is
  // labeled "Applied" rather than the generic "Reward earned"/"Paid".
  const rewardIsPastApplied = reward?.status === 'applied' && !state?.has_active_renewal_offer;
  const appliedInviteId = rewardIsPastApplied ? reward?.invite_id ?? null : null;

  const orderedInvites = [
    ...invites.filter((i) => i.status === 'claimed'),
    ...invites.filter((i) => i.status === 'converted'),
  ];

  const handleCopyCode = async () => {
    if (!shareCodeValue) return;
    if (await copyText(shareCodeValue)) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackTitle: 'Profile',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: colors.accentLight,
          headerTitleStyle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
          title: COPY.title,
        }}
      />

      <View style={styles.screen}>
        {loading ? (
          <ScrollView contentContainerStyle={styles.content} scrollEnabled={false}>
            <ReferralSkeleton />
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { void onRefresh(); }}
                tintColor={colors.accentLight}
              />
            }
          >
            {/* Hero header */}
            <View style={styles.heroCard}>
              <Ionicons name="people" size={32} color={colors.accent} style={{ marginBottom: 10 }} />
              <Text style={styles.heroTitle}>Enjoying Relentless?</Text>
              <Text style={styles.heroSub}>
                Share with a teammate and you both get{' '}
                <Text style={styles.heroHighlight}>20% OFF</Text>
                {' '}— your next {period(state?.cadence ?? null)}, their first.
              </Text>
            </View>

            {/* How it works (PRD 10.5.7 cap disclosure before inviting) */}
            <Text style={styles.sectionLabel}>{COPY.howTitle.toUpperCase()}</Text>
            <View style={styles.card}>
              <Text style={styles.body}>{COPY.howBody(state?.cadence ?? null)}</Text>
              <Text style={styles.footnote}>{COPY.capDisclosure(state?.cadence ?? null)}</Text>
            </View>

            {shareCodeValue && canShare ? (
              <>
                <Text style={styles.sectionLabel}>{COPY.yourCodeTitle.toUpperCase()}</Text>
                <View style={styles.shareCodeCard}>
                  <View style={styles.shareCodePill}>
                    <Text style={styles.shareCodeValue} selectable>{shareCodeValue}</Text>
                  </View>
                  <View style={styles.shareCodeActions}>
                    {canCopyCode ? (
                      <TouchableOpacity
                        style={styles.shareCodeIconBtn}
                        onPress={() => { void handleCopyCode(); }}
                        activeOpacity={0.75}
                        accessibilityLabel="Copy code"
                      >
                        <Ionicons name="copy-outline" size={18} color={colors.accentLight} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.shareCodeIconBtn}
                      onPress={() => { void handleShare(); }}
                      disabled={busy}
                      activeOpacity={0.75}
                      accessibilityLabel={COPY.shareCta}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.accentLight} />
                      ) : (
                        <Ionicons name="share-outline" size={18} color={colors.accentLight} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : null}

            {/* Reward */}
            {reward ? (
              <>
                <Text style={styles.sectionLabel}>{COPY.rewardTitle.toUpperCase()}</Text>
                <View style={styles.card}>
                  <Text style={styles.body}>
                    {reward.status === 'ready'
                      ? COPY.rewardReady
                      : reward.status === 'applied'
                        ? (rewardIsPastApplied
                          ? COPY.rewardAppliedPast(state?.cadence ?? null)
                          : COPY.rewardApplied(state?.cadence ?? null))
                        : COPY.rewardPending}
                  </Text>
                  {reward.status === 'ready' && !state?.has_active_renewal_offer ? (
                    <TouchableOpacity
                      style={[styles.button, busy && styles.buttonDisabled]}
                      onPress={() => { void handleApply(); }}
                      disabled={busy}
                      activeOpacity={0.85}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.buttonText}>{COPY.applyCta}</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>{COPY.invitesTitle.toUpperCase()}</Text>
            {orderedInvites.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.body}>{COPY.invitesEmpty}</Text>
              </View>
            ) : (
              orderedInvites.map((invite) => {
                const isAppliedInvite = invite.id === appliedInviteId;
                const chip = inviteChip(invite, isAppliedInvite);
                return (
                  <View
                    key={invite.id}
                    style={[
                      styles.inviteCard,
                      chip.tone === 'claimed' && styles.inviteCardClaimed,
                      chip.tone === 'converted' && styles.inviteCardConverted,
                    ]}
                  >
                    <View style={styles.inviteCardTop}>
                      <View style={styles.inviteCardMain}>
                        <Text style={[styles.inviteCode, styles.inviteCardTitleMuted]}>
                          {inviteTitle(invite)}
                        </Text>
                        <Text
                          style={[
                            styles.inviteStatus,
                            chip.tone === 'converted' && styles.inviteStatusConverted,
                            chip.tone === 'claimed' && styles.inviteStatusClaimed,
                          ]}
                        >
                          {inviteStatusCopy(invite, isAppliedInvite)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.inviteChip,
                          chip.tone === 'claimed' && styles.inviteChipClaimed,
                          chip.tone === 'converted' && styles.inviteChipConverted,
                        ]}
                      >
                        {chip.tone === 'converted' ? (
                          <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                        ) : null}
                        <Text
                          style={[
                            styles.inviteChipText,
                            chip.tone === 'claimed' && styles.inviteChipTextClaimed,
                            chip.tone === 'converted' && styles.inviteChipTextConverted,
                          ]}
                        >
                          {chip.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!shareCodeValue && canShare ? (
              <TouchableOpacity
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={() => { void handleShare(); }}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>{COPY.shareCta}</Text>
                )}
              </TouchableOpacity>
            ) : state && !state.eligible ? (
              <Text style={styles.footnoteCentered}>
                {ineligibleCopy(state.reason, state.cadence)}
              </Text>
            ) : null}

            {/* Ambassador section — no lock, links to external application */}
            <View style={styles.ambassadorCard}>
              <View style={styles.ambassadorTitleRow}>
                <Text style={styles.ambassadorTitle}>Relentless Ambassador</Text>
              </View>
              <Text style={styles.ambassadorBody}>
                Think you can grow the Relentless community? Apply to become an ambassador.
              </Text>
              <TouchableOpacity
                style={styles.ambassadorBtn}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void Linking.openURL('https://ambassador.relentlessmentaltoughness.com/');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.ambassadorBtnText}>
                  Apply to be an ambassador
                </Text>
              </TouchableOpacity>
              <Text style={styles.ambassadorEmail}>
                Coach, team, or organization?{' '}
                <Text
                  style={styles.ambassadorEmailLink}
                  onPress={() => Linking.openURL(`mailto:${AMBASSADOR_EMAIL}?subject=${encodeURIComponent('Coach / Team Plans Inquiry')}`)}
                >
                  Email {AMBASSADOR_EMAIL}
                </Text>
                {' '}for team plans.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>

    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: TAB_BAR_CLEARANCE + 24,
  },

  // Hero header
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 24,
    marginBottom: 28,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  heroSub: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
  },
  heroHighlight: {
    color: colors.accentLight,
    fontWeight: '800',
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  body: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  footnote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  footnoteCentered: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  shareCodeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareCodePill: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  shareCodeValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1.6,
  },
  shareCodeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareCodeIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  inviteCardClaimed: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
  },
  inviteCardConverted: {
    borderColor: 'rgba(74, 222, 128, 0.28)',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
  },
  inviteCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  inviteCardMain: { flex: 1, minWidth: 0 },
  inviteCode: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 2,
    marginBottom: 4,
  },
  inviteCardTitleMuted: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
    color: colors.textPrimary,
  },
  inviteStatus: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  inviteStatusClaimed: { color: '#f59e0b', fontWeight: '600' },
  inviteStatusConverted: { color: colors.success, fontSize: 13, fontWeight: '600' },
  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inviteChipClaimed: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  inviteChipConverted: {
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderColor: 'rgba(74, 222, 128, 0.35)',
  },
  inviteChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.3,
  },
  inviteChipTextClaimed: { color: '#f59e0b' },
  inviteChipTextConverted: { color: colors.success },

  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },

  // Ambassador section
  ambassadorCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.20)',
    padding: 20,
    marginTop: 28,
    marginBottom: 8,
  },
  ambassadorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ambassadorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ambassadorBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 16,
  },
  ambassadorBtn: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
  },
  ambassadorBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.2,
  },
  ambassadorEmail: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  ambassadorEmailLink: {
    color: colors.accentLight,
    textDecorationLine: 'underline',
  },

  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  error: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
