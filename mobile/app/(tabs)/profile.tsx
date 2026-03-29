import { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

type Progress = {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
};

type Streak = {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
};

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [sRes] = await Promise.all([
      apiFetch<Streak>('/streak'),
    ]);
    if (sRes.data) setStreak(sRes.data);
    setLoading(false);
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
        <Text style={styles.streak}>{streak?.current_streak ?? 0}🔥</Text>
      </View>

      {/* User Info */}
      <View style={styles.userRow}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={colors.accentLight} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userSport}>Track and Field Athlete</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.white} style={styles.loader} />
      ) : (
        <>
          <ProfileRow label="Lessons Done:" value="—" />
          <ProfileRow label="Update Competition Date:" value="—" />
          <ProfileRow label="See Prev. Journal Entries:" chevron />
        </>
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
}: {
  label: string;
  value?: string;
  chevron?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.profileRow}
      activeOpacity={chevron ? 0.7 : 1}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {chevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  brand: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 2,
  },
  streak: {
    fontSize: 22,
    color: colors.white,
    fontWeight: '700',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  userSport: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  loader: {
    marginTop: 40,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  rowValue: {
    fontSize: 15,
    color: colors.textMuted,
  },
  signOutBtn: {
    marginTop: 40,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
});
