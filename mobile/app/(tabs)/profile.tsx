import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getCached, setCached, bustCache } from '@/lib/api-cache';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import { SUPERWALL_ENABLED, SUPERWALL_ONBOARDING_PLACEMENT } from '@/lib/superwall-config';
import { supabase } from '@/lib/supabase';

type Streak = {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
};

type ProgressSummary = {
  total_completions: number;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function toLocalISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function ProfileScreen() {
  const {
    session,
    signOut,
    competitionDate,
    updateCompetitionDate,
    refreshUserState,
    resetOnboarding,
    revokePremiumForTesting,
    isDevAccount,
  } = useAuth();
  const router = useRouter();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [totalCompletions, setTotalCompletions] = useState<number | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const [dateSaving, setDateSaving] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [devToolsVisible, setDevToolsVisible] = useState(false);

  useEffect(() => {
    if (isDevAccount) setDevToolsVisible(true);
  }, [isDevAccount]);

  const persistCompDate = useCallback(
    async (date: string | null) => {
      setDateSaving(true);
      try {
        const err = await updateCompetitionDate(date);
        if (err) Alert.alert('Could not save', err);
      } finally {
        setDateSaving(false);
      }
    },
    [updateCompetitionDate],
  );
  const [devDay, setDevDay] = useState<number | null>(null);
  const [devDayBusy, setDevDayBusy] = useState(false);
  const brandTapCount = useRef(0);
  const brandTapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleBrandTap = () => {
    if (!isDevAccount) return;
    brandTapCount.current += 1;
    clearTimeout(brandTapTimer.current);
    if (brandTapCount.current >= 5) {
      brandTapCount.current = 0;
      setDevToolsVisible((v) => !v);
    } else {
      brandTapTimer.current = setTimeout(() => { brandTapCount.current = 0; }, 800);
    }
  };

  const fetchData = async () => {
    const cachedStreak = getCached<Streak>('/streak');
    const cachedProgress = getCached<ProgressSummary>('/progress');
    if (cachedStreak && cachedProgress) {
      setStreak(cachedStreak);
      setTotalCompletions(cachedProgress.total_completions ?? 0);
      return;
    }
    const [sRes, pRes] = await Promise.all([
      apiFetch<Streak>('/streak'),
      apiFetch<ProgressSummary>('/progress'),
    ]);
    if (sRes.data) { setStreak(sRes.data); setCached('/streak', sRes.data); }
    if (pRes.data) { setTotalCompletions(pRes.data.total_completions ?? 0); setCached('/progress', pRes.data); }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      if (__DEV__ || isDevAccount) {
        supabase.rpc('dev_get_program_day')
          .then(({ data }) => { if (typeof data === 'number') setDevDay(data); });
      }
    }, [isDevAccount]),
  );

  const handleRestore = async () => {
    if (!SUPERWALL_ENABLED) return;
    setRestoreBusy(true);
    try {
      const sw = require('expo-superwall');
      await sw.useSuperwallStore.getState().registerPlacement(SUPERWALL_ONBOARDING_PLACEMENT);
      await refreshUserState();
    } catch (err) {
      console.warn('[Profile] Restore purchases failed', err);
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleManageSubscription = () => {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  };

  const performAccountDeletion = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      const { error } = await apiFetch('/account', { method: 'DELETE' });
      if (error) {
        Alert.alert('Could not delete account', error);
        return;
      }
      // Auth row is gone; clear local session. RouteGuard sends user to welcome.
      await signOut();
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeleteAccount = () => {
    if (deleteBusy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete your account?',
      'This will permanently delete all your data and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void performAccountDeletion(); } },
      ],
      { cancelable: true },
    );
  };

  const handleDevSetDay = async (day: number) => {
    if (devDayBusy || day < 1 || day > 30) return;
    setDevDayBusy(true);
    try {
      const { data } = await supabase.rpc('dev_set_program_day', { p_day: day });
      if (typeof data === 'number') setDevDay(data);
      bustCache('/lessons/next', '/progress', '/streak');
    } catch { /* RPC may not be deployed yet */ }
    setDevDayBusy(false);
  };

  const email = session?.user?.email ?? '';
  const displayName = email ? email.split('@')[0] : 'Athlete';

  const daysUntilCompetition = competitionDate
    ? Math.ceil((new Date(competitionDate + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const showCountdown = daysUntilCompetition != null && daysUntilCompetition > 0;

  const lastActiveText = streak?.last_activity_date
    ? (() => {
        const diffDays = Math.max(0, Math.floor(
          (Date.now() - new Date(streak.last_activity_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24),
        ));
        if (diffDays === 0) return 'Active today';
        if (diffDays === 1) return 'Active yesterday';
        return `Active ${diffDays} days ago`;
      })()
    : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBrandTap}>
          <Text style={styles.brand}>RELENTLESS</Text>
        </Pressable>
        <View style={styles.streakPill}>
          <Text style={styles.streakNum}>{streak?.current_streak ?? 0}</Text>
          <Ionicons name="flame" size={16} color="#f59e0b" />
        </View>
      </View>

      {/* Identity Hero */}
      <View style={styles.heroSection}>
        <View style={styles.avatarOuter}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={38} color={colors.accent} />
          </View>
        </View>
        <Text style={styles.userName}>{displayName}</Text>
        <Text style={styles.userSport}>Track and Field Athlete</Text>
      </View>

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statsColumns}>
          <StatColumn
            label="Streak"
            value={streak?.current_streak ?? 0}
            icon="flame"
            iconColor="#f59e0b"
            iconBg="rgba(245, 158, 11, 0.10)"
          />
          <View style={styles.statDivider} />
          <StatColumn
            label="Best Streak"
            value={streak?.longest_streak ?? 0}
            icon="trophy-outline"
            iconColor={colors.accentLight}
            iconBg={colors.accentSubtle}
          />
          <View style={styles.statDivider} />
          <StatColumn
            label="Lessons"
            value={totalCompletions ?? 0}
            icon="checkmark-circle-outline"
            iconColor={colors.success}
            iconBg="rgba(74, 222, 128, 0.10)"
          />
        </View>
        {lastActiveText && (
          <View style={styles.lastActiveRow}>
            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
            <Text style={styles.lastActiveText}>{lastActiveText}</Text>
          </View>
        )}
      </View>

      {/* Competition Countdown */}
      {showCountdown && (
        <View style={styles.countdownCard}>
          <View style={styles.countdownIconWrap}>
            <Ionicons name="calendar" size={18} color={colors.accent} />
          </View>
          <View style={styles.countdownTextCol}>
            <Text style={styles.countdownDays}>{daysUntilCompetition} days</Text>
            <Text style={styles.countdownLabel}>until competition</Text>
          </View>
        </View>
      )}

      {/* Settings Section */}
      <Text style={styles.sectionLabel}>SETTINGS</Text>
      <View style={styles.rowsContainer}>
        <ProfileRow
          icon="calendar-outline"
          label="Competition Date"
          value={dateSaving ? 'Saving...' : formatDate(competitionDate)}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPendingDate(
              competitionDate ? new Date(competitionDate + 'T00:00:00') : new Date(),
            );
            setDatePickerVisible(true);
          }}
        />
        <ProfileRow
          icon="journal-outline"
          label="Journal Entries"
          chevron
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/journal' as any);
          }}
          last
        />
      </View>

      {/* Date Picker Modal */}
      {datePickerVisible && (
        Platform.OS === 'ios' ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
            <View style={styles.dateOverlay}>
              <Pressable
                style={StyleSheet.absoluteFillObject}
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                onPress={() => setDatePickerVisible(false)}
              />
              <View style={styles.dateSheet}>
                <DateTimePicker
                  value={pendingDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  textColor={colors.textPrimary}
                  onChange={(_, selected) => {
                    if (selected) setPendingDate(selected);
                  }}
                />
                <View style={styles.dateActions}>
                  <TouchableOpacity
                    style={styles.dateClearBtn}
                    onPress={() => {
                      setDatePickerVisible(false);
                      void persistCompDate(null);
                    }}
                  >
                    <Text style={styles.dateClearText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateSaveBtn}
                    onPress={() => {
                      setDatePickerVisible(false);
                      void persistCompDate(toLocalISODate(pendingDate));
                    }}
                  >
                    <Text style={styles.dateSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={pendingDate}
            mode="date"
            minimumDate={new Date()}
            onChange={(event: DateTimePickerEvent, selected) => {
              if (event.type === 'dismissed') {
                setDatePickerVisible(false);
                return;
              }
              if (event.type !== 'set' || !selected) {
                setDatePickerVisible(false);
                return;
              }
              setDatePickerVisible(false);
              void persistCompDate(toLocalISODate(selected));
            }}
          />
        )
      )}

      {/* Subscription Section */}
      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
      <View style={styles.rowsContainer}>
        {SUPERWALL_ENABLED && (
          <ProfileRow
            icon="arrow-down-circle-outline"
            label="Restore Purchases"
            value={restoreBusy ? 'Restoring...' : undefined}
            onPress={restoreBusy ? undefined : handleRestore}
          />
        )}
        <ProfileRow
          icon="card-outline"
          label="Manage Subscription"
          chevron
          onPress={handleManageSubscription}
          last
        />
      </View>

      {/* Dev Tools — is_dev accounts only; tap "RELENTLESS" 5× to toggle */}
      {isDevAccount && devToolsVisible && (
        <>
          <Text style={styles.sectionLabel}>DEV TOOLS</Text>
          <View style={styles.rowsContainer}>
            <View style={[styles.profileRow, { justifyContent: 'space-between' }]}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="calendar-outline" size={17} color={colors.accentLight} />
                </View>
                <Text style={styles.rowLabel}>Program Day</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => handleDevSetDay((devDay ?? 1) - 1)}
                  disabled={devDayBusy || (devDay ?? 1) <= 1}
                  style={{ opacity: (devDay ?? 1) <= 1 ? 0.3 : 1 }}
                >
                  <Ionicons name="remove-circle-outline" size={24} color={colors.accentLight} />
                </TouchableOpacity>
                <Text style={[styles.rowValue, { minWidth: 36, textAlign: 'center' }]}>
                  {devDayBusy ? '...' : devDay ?? '—'}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDevSetDay((devDay ?? 1) + 1)}
                  disabled={devDayBusy || (devDay ?? 1) >= 30}
                  style={{ opacity: (devDay ?? 1) >= 30 ? 0.3 : 1 }}
                >
                  <Ionicons name="add-circle-outline" size={24} color={colors.accentLight} />
                </TouchableOpacity>
              </View>
            </View>
            <ProfileRow
              icon="card-outline"
              label="Jump to Paywall"
              chevron
              onPress={() => revokePremiumForTesting()}
            />
            <ProfileRow
              icon="refresh-outline"
              label="Reset to Onboarding"
              chevron
              onPress={resetOnboarding}
              last
            />
          </View>
        </>
      )}

      {/* Sign Out — neutral secondary (session end, not “danger”) */}
      <TouchableOpacity style={styles.signOutBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); signOut(); }}>
        <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Delete account — slightly stronger than sign out; confirmation stays in Alert */}
      <TouchableOpacity
        style={[styles.deleteAccountBtn, deleteBusy && styles.deleteAccountBtnBusy]}
        onPress={handleDeleteAccount}
        disabled={deleteBusy}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
      >
        <Ionicons name="trash-outline" size={16} color={colors.error} style={{ marginRight: 8 }} />
        <Text style={styles.deleteAccountText}>
          {deleteBusy ? 'Deleting…' : 'Delete Account'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatColumn({
  label,
  value,
  icon,
  iconColor,
  iconBg,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg?: string;
}) {
  return (
    <View style={styles.statCol}>
      <View style={[styles.statIconWrap, iconBg ? { backgroundColor: iconBg } : undefined]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  chevron,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  chevron?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.profileRow, last && styles.profileRowLast]}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowLeft}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon} size={17} color={colors.accentLight} />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      ) : (
        <Text style={styles.rowValue}>{value}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: TAB_BAR_CLEARANCE,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  brand: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakNum: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Identity Hero
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  userSport: {
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },

  // Stats Card
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 2,
    borderTopColor: 'rgba(139, 92, 246, 0.3)',
    paddingTop: 22,
    paddingBottom: 16,
    marginBottom: 36,
  },
  statsColumns: {
    flexDirection: 'row',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  statValue: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 36,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  lastActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginHorizontal: 20,
  },
  lastActiveText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 36,
  },
  countdownIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownTextCol: {
    flex: 1,
  },
  countdownDays: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
  },

  // Settings section
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  rowsContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  profileRowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  rowValue: {
    fontSize: 14,
    color: colors.textMuted,
  },

  // Date picker
  dateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dateSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  dateActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dateClearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  dateClearText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.error,
  },
  dateSaveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  dateSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },

  // Sign out — same chrome as settings rows, muted label
  signOutBtn: {
    marginTop: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  signOutText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Delete account — full-width destructive hint (tint + border), stronger than sign out
  deleteAccountBtn: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.28)',
    backgroundColor: 'rgba(239, 68, 68, 0.07)',
  },
  deleteAccountBtnBusy: {
    opacity: 0.55,
  },
  deleteAccountText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
    letterSpacing: 0.2,
  },
});
