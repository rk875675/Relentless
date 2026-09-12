import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';
import type { ReferralCadence } from '@/lib/referral';

/*
 * HUMAN INPUT NEEDED — copy not approved.
 *
 * Placeholders only, pending sign-off in docs/referral_copy_for_approval.md.
 * They are written to satisfy the PRD 10.5.9 constraints, which any
 * replacement must also satisfy:
 *   - anchors on the teammate's first PAYMENT, never on trial completion
 *   - names the reader's own period rather than saying "billing period", and
 *     never says "this month" to someone who may be on annual
 *   - never implies the sharer's next charge is already discounted
 *   - DEVIATION FROM RULE 2, pending a PRD amendment — see the matching note
 *     in mobile/app/referral/index.tsx
 *   - may state 20% only while every configured point stays at or below
 *     0.8 x list, which currently holds on all four SKUs (the $7.99 monthly
 *     is configured at $6.39, or 20.03% off)
 */
const COPY = {
  title: 'Train with a teammate',
  // Names the reader's own period (they are a subscriber, so the server knows
  // it) and leaves the teammate's side as "their first payment", since the
  // teammate has not chosen a plan yet.
  body: (cadence: ReferralCadence | null) =>
    `Invite a teammate. When their first payment goes through, you both get 20% off — your next ${cadence === 'annual' ? 'year' : 'month'}, and their first payment.`,
  primary: 'Invite a teammate',
  dismiss: 'Not now',
} as const;

type Props = {
  visible: boolean;
  /** The viewer's own billing cadence, for naming their period in the body. */
  cadence: ReferralCadence | null;
  onInvite: () => void;
  onDismiss: () => void;
};

export default function ReferralPopup({ visible, cadence, onInvite, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="people-outline" size={36} color={colors.accent} />
          </View>
          <Text style={styles.title}>{COPY.title}</Text>
          <Text style={styles.body}>{COPY.body(cadence)}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onInvite}>
            <Text style={styles.primaryText}>{COPY.primary}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onDismiss}>
            <Text style={styles.secondaryText}>{COPY.dismiss}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Mirrors the push-permission prompt, the closest existing two-button sheet.
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    alignItems: 'center',
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  primaryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  secondaryText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
});
