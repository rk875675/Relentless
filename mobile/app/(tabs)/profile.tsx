import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
import { MAX_SPORT_LEN, OTHER_SENTINEL, PRESET_SPORTS, isPresetSport } from '@/lib/sport-presets';
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
    sport,
    updateCompetitionDate,
    updateSport,
    refreshUserState,
    resetOnboarding,
    revokePremiumForTesting,
    isDevAccount,
  } = useAuth();
  const router = useRouter();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [totalCompletions, setTotalCompletions] = useState<number | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [sportPickVisible, setSportPickVisible] = useState(false);
  const [sportPickSelected, setSportPickSelected] = useState<string | null>(null);
  const [sportPickOther, setSportPickOther] = useState('');
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const [dateSaving, setDateSaving] = useState(false);
  const [sportSaving, setSportSaving] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [devToolsVisible, setDevToolsVisible] = useState(false);
  const [profileStatsError, setProfileStatsError] = useState('');
  const [profileStatsLoading, setProfileStatsLoading] = useState(false);

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

  const openSportPicker = useCallback(() => {
    const s = sport?.trim() ?? '';
    if (s && isPresetSport(s)) {
      setSportPickSelected(s);
      setSportPickOther('');
    } else if (s) {
      setSportPickSelected(OTHER_SENTINEL);
      setSportPickOther(s.slice(0, MAX_SPORT_LEN));
    } else {
      setSportPickSelected(null);
      setSportPickOther('');
    }
    setSportPickVisible(true);
  }, [sport]);

  const persistSport = useCallback(async () => {
    const isOther = sportPickSelected === OTHER_SENTINEL;
    const resolved = isOther ? sportPickOther.trim() : sportPickSelected?.trim() ?? '';
    if (!resolved || resolved.length > MAX_SPORT_LEN) return;
    if (isOther && resolved.length < 2) return;
    setSportSaving(true);
    try {
      const err = await updateSport(resolved);
      if (err) Alert.alert('Could not save', err);
      else setSportPickVisible(false);
    } finally {
      setSportSaving(false);
    }
  }, [sportPickSelected, sportPickOther, updateSport]);

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

  const loadProfileStats = useCallback(async () => {
    setProfileStatsError('');
    const cachedStreak = getCached<Streak>('/streak');
    const cachedProgress = getCached<ProgressSummary>('/progress');
    if (cachedStreak) setStreak(cachedStreak);
    if (cachedProgress) setTotalCompletions(cachedProgress.total_completions ?? 0);

    setProfileStatsLoading(true);
    const [sRes, pRes] = await Promise.all([
      apiFetch<Streak>('/streak'),
      apiFetch<ProgressSummary>('/progress'),
    ]);
    setProfileStatsLoading(false);

    if (sRes.data) {
      setStreak(sRes.data);
      setCached('/streak', sRes.data);
    }
    if (pRes.data) {
      setTotalCompletions(pRes.data.total_completions ?? 0);
      setCached('/progress', pRes.data);
    }

    const errs = [sRes.error, pRes.error].filter(Boolean) as string[];
    setProfileStatsError(errs.length > 0 ? errs.join(' · ') : '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshUserState().catch(() => {});
      void loadProfileStats();
      if (__DEV__ || isDevAccount) {
        supabase.rpc('dev_get_program_day')
          .then(({ data }) => { if (typeof data === 'number') setDevDay(data); });
      }
    }, [isDevAccount, refreshUserState, loadProfileStats]),
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
  const displayName = email ? email.split('@')[0] : 'Account';
  const heroSportLine = sport?.trim() ?? '';

  const sportResolvedForSave =
    sportPickSelected === OTHER_SENTINEL
      ? sportPickOther.trim()
      : sportPickSelected?.trim() ?? '';
  const sportPickCanSave =
    sportPickSelected !== null &&
    sportResolvedForSave.length > 0 &&
    sportResolvedForSave.length <= MAX_SPORT_LEN &&
    (sportPickSelected !== OTHER_SENTINEL || sportPickOther.trim().length >= 2);

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
    <>
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
        {heroSportLine ? (
          <Text style={styles.userSport}>{heroSportLine}</Text>
        ) : (
          <Text style={styles.userSportMuted}>Set your sport in Settings</Text>
        )}
      </View>

      {profileStatsError ? (
        <View style={styles.statsErrorBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.error} style={{ marginRight: 8 }} />
          <Text style={styles.statsErrorText} numberOfLines={3}>{profileStatsError}</Text>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void loadProfileStats(); }}
            style={styles.statsRetryBtn}
            disabled={profileStatsLoading}
          >
            {profileStatsLoading ? (
              <ActivityIndicator color={colors.accentLight} size="small" />
            ) : (
              <Text style={styles.statsRetryText}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

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
          icon="football-outline"
          label="Sport"
          value={sportSaving ? 'Saving...' : sport?.trim() ? sport.trim() : '—'}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openSportPicker();
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
          <Text style={styles.devStreakHint}>
            Dev tools are not for normal accounts—they only appear on internal test accounts and are
            meant for QA, not everyday use.
          </Text>
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

    {sportPickVisible && (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => !sportSaving && setSportPickVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.sportOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.trackBackdrop}
            accessibilityRole="button"
            accessibilityLabel="Close sport picker"
            onPress={() => !sportSaving && setSportPickVisible(false)}
          />
          <View style={styles.sportSheet}>
            <Text style={styles.sportSheetTitle}>{"What's your sport?"}</Text>
            <Text style={styles.sportSheetBody}>
              Same choices as onboarding. Updates your profile right away.
            </Text>
            <ScrollView
              style={styles.sportScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.trackOptions}>
                {PRESET_SPORTS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.trackOptionBtn,
                      sportPickSelected === opt && styles.trackOptionBtnActive,
                    ]}
                    disabled={sportSaving}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSportPickSelected(opt);
                      if (opt !== OTHER_SENTINEL) setSportPickOther('');
                    }}
                  >
                    <Text
                      style={[
                        styles.trackOptionText,
                        sportPickSelected === opt && styles.trackOptionTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {sportPickSelected === OTHER_SENTINEL ? (
                <TextInput
                  style={styles.sportOtherInput}
                  placeholder="Type your sport"
                  placeholderTextColor={colors.textMuted}
                  value={sportPickOther}
                  onChangeText={setSportPickOther}
                  maxLength={MAX_SPORT_LEN}
                  autoCapitalize="words"
                  autoCorrect
                  editable={!sportSaving}
                />
              ) : null}
            </ScrollView>
            <View style={styles.sportActions}>
              <TouchableOpacity
                style={styles.dateClearBtn}
                disabled={sportSaving}
                onPress={() => setSportPickVisible(false)}
              >
                <Text style={styles.dateClearText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dateSaveBtn,
                  (!sportPickCanSave || sportSaving) && styles.dateSaveBtnDisabled,
                ]}
                disabled={!sportPickCanSave || sportSaving}
                onPress={() => void persistSport()}
              >
                <Text style={styles.dateSaveText}>{sportSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    )}

    {datePickerVisible && (
      Platform.OS === 'ios' ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
          <View style={styles.dateOverlay} pointerEvents="box-none">
            <Pressable
              style={styles.trackBackdrop}
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
    </>
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
  userSportMuted: {
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.3,
    fontStyle: 'italic',
  },

  statsErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  statsErrorText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statsRetryBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  statsRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentLight,
  },
  devStreakHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: 10,
    paddingHorizontal: 4,
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

  trackBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  sportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sportSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    maxHeight: '88%',
    zIndex: 2,
    elevation: 12,
  },
  sportSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  sportSheetBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  sportScroll: {
    maxHeight: 340,
  },
  sportOtherInput: {
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sportActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trackOptions: { gap: 12 },
  trackOptionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  trackOptionBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  trackOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  trackOptionTextActive: {
    color: colors.accentLight,
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
    zIndex: 2,
    elevation: 12,
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
  dateSaveBtnDisabled: {
    opacity: 0.45,
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
