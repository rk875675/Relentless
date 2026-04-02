import { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getCached, setCached } from '@/lib/api-cache';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

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

export default function ProfileScreen() {
  const { session, signOut, competitionDate, updateCompetitionDate } = useAuth();
  const router = useRouter();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [totalCompletions, setTotalCompletions] = useState<number | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const [dateSaving, setDateSaving] = useState(false);

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
    }, []),
  );

  const email = session?.user?.email ?? '';
  const displayName = email ? email.split('@')[0] : 'Athlete';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>RELENTLESS</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakNum}>{streak?.current_streak ?? 0}</Text>
          <Ionicons name="flame" size={16} color="#f59e0b" />
        </View>
      </View>

      {/* Identity Hero */}
      <View style={styles.heroSection}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={34} color={colors.accent} />
        </View>
        <Text style={styles.userName}>{displayName}</Text>
        <Text style={styles.userSport}>Track and Field Athlete</Text>
      </View>

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <StatColumn
          label="Streak"
          value={streak?.current_streak ?? 0}
          icon="flame"
          iconColor="#f59e0b"
        />
        <View style={styles.statDivider} />
        <StatColumn
          label="Best Streak"
          value={streak?.longest_streak ?? 0}
          icon="trophy-outline"
          iconColor={colors.accentLight}
        />
        <View style={styles.statDivider} />
        <StatColumn
          label="Lessons"
          value={totalCompletions ?? 0}
          icon="checkmark-circle-outline"
          iconColor={colors.success}
        />
      </View>

      {/* Settings Section */}
      <Text style={styles.sectionLabel}>SETTINGS</Text>
      <View style={styles.rowsContainer}>
        <ProfileRow
          icon="calendar-outline"
          label="Competition Date"
          value={dateSaving ? 'Saving...' : formatDate(competitionDate)}
          onPress={() => {
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
          onPress={() => router.push('/journal' as any)}
          last
        />
      </View>

      {/* Date Picker Modal */}
      {datePickerVisible && (
        Platform.OS === 'ios' ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
            <Pressable style={styles.dateOverlay} onPress={() => setDatePickerVisible(false)}>
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
                    onPress={async () => {
                      setDatePickerVisible(false);
                      setDateSaving(true);
                      await updateCompetitionDate(null);
                      setDateSaving(false);
                    }}
                  >
                    <Text style={styles.dateClearText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateSaveBtn}
                    onPress={async () => {
                      setDatePickerVisible(false);
                      setDateSaving(true);
                      const ymd = pendingDate.toISOString().slice(0, 10);
                      await updateCompetitionDate(ymd);
                      setDateSaving(false);
                    }}
                  >
                    <Text style={styles.dateSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={pendingDate}
            mode="date"
            minimumDate={new Date()}
            onChange={async (_, selected) => {
              setDatePickerVisible(false);
              if (selected) {
                setDateSaving(true);
                const ymd = selected.toISOString().slice(0, 10);
                await updateCompetitionDate(ymd);
                setDateSaving(false);
              }
            }}
          />
        )
      )}

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Ionicons name="log-out-outline" size={16} color={colors.error} style={{ marginRight: 8 }} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatColumn({
  label,
  value,
  icon,
  iconColor,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}) {
  return (
    <View style={styles.statCol}>
      <Ionicons name={icon} size={18} color={iconColor} style={{ marginBottom: 6 }} />
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
    marginBottom: 28,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  userSport: {
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },

  // Stats Card
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 20,
    marginBottom: 28,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 32,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Settings section
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  rowsContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 8,
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

  // Sign out
  signOutBtn: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  signOutText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
});
