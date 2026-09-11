import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  type ReferralInvite,
  type ReferralState,
} from '@/lib/referral';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

// App Store Connect app ID — matches ascAppId in mobile/eas.json.
const APP_STORE_URL = 'https://apps.apple.com/app/id6762413686';

// ---------------------------------------------------------------------------
// HUMAN INPUT NEEDED — placeholder copy. Every user-facing string for the
// referral space lives in this one block; review/replace before release.
//
// PRD 10.5.9 constrains these strings: they must anchor on the teammate's
// FIRST PAYMENT rather than trial completion (a previously-expired invitee
// gets no trial), must say the discount covers one billing period and then
// returns to full price, and must never say "this month" to someone who may
// be on annual. No discount percentage appears anywhere below on purpose —
// "20% off" may only be shown once the configured App Store price points are
// confirmed to be at least 20% below list.
//
// PRD 10.5.6 additionally forbids stating that the sharer's next charge is
// discounted before Apple has accepted the promotional offer.
// ---------------------------------------------------------------------------
const COPY = {
  title: 'Invite a teammate',

  howTitle: 'How it works',
  howBody:
    'Send a teammate your invite code. When they subscribe and their first payment goes through, you each get one discounted billing period, then both return to full price.',
  capDisclosure:
    'You can earn one reward per billing period. Extra conversions in the same period do not add another.',

  shareCta: 'Get an invite code',
  shareMessage: (code: string) =>
    `Join me on Relentless. Use code ${code} when you subscribe.\n\n${APP_STORE_URL}`,

  invitesTitle: 'Your invites',
  invitesEmpty: 'You have not created an invite yet.',
  statusOpen: 'Not used yet',
  statusClaimed: 'Waiting on their first payment',
  statusConverted: 'Reward earned',
  expiresPrefix: 'Expires ',

  rewardTitle: 'Your reward',
  rewardPending: 'Waiting on your teammate’s first payment.',
  rewardReady: 'Your reward is ready to apply.',
  rewardApplied: 'Applied. Apple has accepted your offer.',
  applyCta: 'Apply my reward',
  applySubmitted:
    'Submitted to Apple. Your discount takes effect at your next billing date once Apple confirms it.',

  ineligibleSubscription: 'Inviting is available to subscribers on an active plan.',
  // A trial user IS on an active plan, so the string above would mislead them.
  // The sharer must have paid at least once.
  ineligibleTrial: 'Inviting unlocks after your first payment goes through.',
  ineligibleAutoRenewOff:
    'Turn your subscription renewal back on to invite a teammate.',
  ineligibleBilling: 'We could not confirm your subscription with the App Store.',
  ineligibleSlotUsed:
    'You have already earned your reward for this billing period. You can invite again next period.',
  ineligibleUnavailable: 'Inviting is temporarily unavailable. Please try again later.',

  errorLoad: 'Could not load your invites. Pull down to try again.',
  errorShare: 'Could not create an invite code. Please try again.',
  errorApply: 'Could not apply your reward. Please try again.',
  errorApplyOfferActive:
    'You already have an offer on your next renewal. Apple allows only one at a time.',
};

// Covers every Reason the eligibility endpoint can return; the default is the
// set of states that all mean "not a paying subscriber right now".
function ineligibleCopy(reason: string | null): string {
  switch (reason) {
    case 'trial_not_paid':
      return COPY.ineligibleTrial;
    case 'auto_renew_off':
      return COPY.ineligibleAutoRenewOff;
    case 'give_slot_used':
      return COPY.ineligibleSlotUsed;
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

function inviteStatusCopy(invite: ReferralInvite): string {
  switch (invite.status) {
    case 'claimed':
      return COPY.statusClaimed;
    case 'converted':
      return COPY.statusConverted;
    default:
      return COPY.statusOpen;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReferralScreen() {
  const { refreshUserState } = useAuth();
  const [state, setState] = useState<ReferralState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shareCode = async (code: string) => {
    try {
      // The message carries the App Store link plus the code as text. Apple
      // redeem URLs are deliberately not distributed: redemption outside the
      // app destroys attribution and bypasses onboarding (PRD 10.5.4).
      await Share.share({ message: COPY.shareMessage(code) });
    } catch {
      // A dismissed share sheet is not an error.
    }
  };

  const handleCreateInvite = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const created = await createReferralInvite();
    if (!created.ok) {
      setError(COPY.errorShare);
      setBusy(false);
      return;
    }

    await load();
    setBusy(false);
    await shareCode(created.code);
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
      Alert.alert('', COPY.applySubmitted);
      await load();
      void refreshUserState();
      return;
    }

    if (applied.reason === 'cancelled') return;
    if (applied.reason === 'already_applied') {
      await load();
      return;
    }
    setError(
      applied.reason === 'offer_already_active'
        ? COPY.errorApplyOfferActive
        : COPY.errorApply,
    );
  };

  const openInvites = (state?.invites ?? []).filter((i) => i.status === 'open');
  const canCreate =
    !!state?.eligible && (state?.open_invites ?? 0) < (state?.max_open_invites ?? 0);
  const reward = state?.reward ?? null;

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
          <View style={styles.center}>
            <ActivityIndicator color={colors.accentLight} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void onRefresh();
                }}
                tintColor={colors.accentLight}
              />
            }
          >
            {/* How it works, plus the per-period cap disclosed before the
                user invites anyone (PRD 10.5.7). */}
            <Text style={styles.sectionLabel}>{COPY.howTitle.toUpperCase()}</Text>
            <View style={styles.card}>
              <Text style={styles.body}>{COPY.howBody}</Text>
              <Text style={styles.footnote}>{COPY.capDisclosure}</Text>
            </View>

            {reward ? (
              <>
                <Text style={styles.sectionLabel}>{COPY.rewardTitle.toUpperCase()}</Text>
                <View style={styles.card}>
                  <Text style={styles.body}>
                    {reward.status === 'ready'
                      ? COPY.rewardReady
                      : reward.status === 'applied'
                        ? COPY.rewardApplied
                        : COPY.rewardPending}
                  </Text>

                  {reward.status === 'ready' ? (
                    <TouchableOpacity
                      style={[styles.button, busy && styles.buttonDisabled]}
                      onPress={() => {
                        void handleApply();
                      }}
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
            <View style={styles.card}>
              {openInvites.length === 0 && (state?.invites ?? []).length === 0 ? (
                <Text style={styles.body}>{COPY.invitesEmpty}</Text>
              ) : (
                (state?.invites ?? []).map((invite, index) => (
                  <View
                    key={invite.id}
                    style={[styles.inviteRow, index === 0 && styles.inviteRowFirst]}
                  >
                    <View style={styles.inviteLeft}>
                      {invite.code ? (
                        <Text style={styles.inviteCode} selectable>
                          {invite.code}
                        </Text>
                      ) : null}
                      <Text style={styles.inviteStatus}>{inviteStatusCopy(invite)}</Text>
                      {invite.status === 'open' ? (
                        <Text style={styles.footnote}>
                          {COPY.expiresPrefix}
                          {formatDate(invite.ttl_expires_at)}
                        </Text>
                      ) : null}
                    </View>

                    {invite.code ? (
                      <TouchableOpacity
                        style={styles.shareIconBtn}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          void shareCode(invite.code as string);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="share-outline"
                          size={20}
                          color={colors.accentLight}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              )}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {canCreate ? (
              <TouchableOpacity
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={() => {
                  void handleCreateInvite();
                }}
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
              <Text style={styles.footnoteCentered}>{ineligibleCopy(state.reason)}</Text>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: TAB_BAR_CLEARANCE,
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
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 14,
  },
  inviteRowFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  inviteLeft: { flex: 1, paddingRight: spacing.md },
  inviteCode: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 2,
    marginBottom: 2,
  },
  inviteStatus: { fontSize: 14, color: colors.textPrimary },
  shareIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: spacing.sm,
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
