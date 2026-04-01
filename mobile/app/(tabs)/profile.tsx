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
    const [sRes, pRes] = await Promise.all([
      apiFetch<Streak>('/streak'),
      apiFetch<ProgressSummary>('/progress'),
    ]);
    if (sRes.data) setStreak(sRes.data);
    if (pRes.data) setTotalCompletions(pRes.data.total_completions ?? 0);
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

      {/* User Info */}
      <View style={styles.userRow}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={colors.accent} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userSport}>Track and Field Athlete</Text>
        </View>
      </View>

      {/* Profile Rows */}
      <View style={styles.rowsContainer}>
        <ProfileRow label="Lessons Done" value={totalCompletions != null ? String(totalCompletions) : '—'} />
        <ProfileRow
          label="Update Competition Date"
          value={dateSaving ? 'Saving...' : formatDate(competitionDate)}
          onPress={() => {
            setPendingDate(
              competitionDate ? new Date(competitionDate + 'T00:00:00') : new Date(),
            );
            setDatePickerVisible(true);
          }}
        />
        <ProfileRow
          label="See Prev. Journal Entries"
          chevron
          onPress={() => router.push('/journal' as any)}
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
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ProfileRow({
  label,
  value,
  chevron,
  onPress,
}: {
  label: string;
  value?: string;
  chevron?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.profileRow}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={styles.rowLabel}>{label}</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
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
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  userSport: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  rowsContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  rowValue: {
    fontSize: 15,
    color: colors.textMuted,
  },
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
  signOutBtn: {
    marginTop: 40,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
});
