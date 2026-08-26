import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { STOREKIT_PRODUCT_IDS } from '@/lib/superwall-config';
import { LEGAL_PRIVACY_POLICY_URL, LEGAL_TERMS_OF_USE_URL } from '@/lib/legal-urls';
import { colors, spacing } from '@/lib/theme';

type Props = {
  /** When true, adds one line that IAP needs a native build with Superwall (PaywallFallback). */
  purchaseUnavailable?: boolean;
};

const SERVICE_TITLE = 'Relentless Premium';

/** Aligned with `STOREKIT_PRODUCT_IDS` in `superwall-config.ts` (durations per subscription tier). */
const PLAN_ROWS: { productId: string; label: string; lengthLabel: string }[] = [
  { productId: STOREKIT_PRODUCT_IDS.monthly, label: 'Monthly', lengthLabel: '1 month' },
  { productId: STOREKIT_PRODUCT_IDS.annual, label: 'Annual', lengthLabel: '1 year' },
];

const ACCESS_DESCRIPTION =
  'Full access to premium training in the app for the subscription period, including daily mindset sessions, MAC progress tracking, and tools tailored to your sport.';

export function SubscriptionLegalDisclosure({ purchaseUnavailable }: Props) {
  const open = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{SERVICE_TITLE}</Text>
      <Text style={styles.body}>{ACCESS_DESCRIPTION}</Text>

      <Text style={styles.sectionLabel}>Subscription options</Text>
      {PLAN_ROWS.map((row) => (
        <Text key={row.productId} style={styles.planLine}>
          {row.label} — {row.lengthLabel} (auto-renewable).
        </Text>
      ))}
      <Text style={styles.priceNote}>
        The price for each plan in your currency is shown on the purchase screen before you confirm
        payment with Apple.
      </Text>

      {purchaseUnavailable ? (
        <Text style={styles.note}>Subscription checkout is not available in this build.</Text>
      ) : null}

      <View style={styles.linksRow}>
        <TouchableOpacity onPress={() => open(LEGAL_TERMS_OF_USE_URL)} accessibilityRole="link">
          <Text style={styles.link}>Terms of Use</Text>
        </TouchableOpacity>
        <Text style={styles.linkSep}> · </Text>
        <TouchableOpacity onPress={() => open(LEGAL_PRIVACY_POLICY_URL)} accessibilityRole="link">
          <Text style={styles.link}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planLine: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginBottom: 4,
  },
  priceNote: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  link: {
    fontSize: 12,
    color: colors.accentLight,
    textDecorationLine: 'underline',
  },
  linkSep: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
