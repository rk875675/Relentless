import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

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
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      apiFetch<Progress>('/progress'),
      apiFetch<Streak>('/streak'),
    ]);
    if (pRes.data) setProgress(pRes.data);
    if (sRes.data) setStreak(sRes.data);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Profile</Text>

      {session?.user?.email ? (
        <Text style={styles.email}>{session.user.email}</Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color="#fff" style={styles.loader} />
      ) : (
        <>
          {/* Streak */}
          <View style={styles.streakCard}>
            <Text style={styles.streakNumber}>{streak?.current_streak ?? 0}</Text>
            <Text style={styles.streakLabel}>Day Streak</Text>
            <Text style={styles.streakSub}>Longest: {streak?.longest_streak ?? 0}</Text>
          </View>

          {/* MAC Progress */}
          <View style={styles.progressSection}>
            <Text style={styles.progressHeading}>MAC Progress</Text>
            <ProgressRow label="Mindfulness" value={progress?.mindfulness_score ?? 0} />
            <ProgressRow label="Acceptance" value={progress?.acceptance_score ?? 0} />
            <ProgressRow label="Commitment" value={progress?.commitment_score ?? 0} />
          </View>
        </>
      )}

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(Math.round(value), 100);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressPct}>{pct}%</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 28,
  },
  loader: {
    marginTop: 40,
  },
  streakCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
  },
  streakNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
  },
  streakLabel: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 4,
  },
  streakSub: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressSection: {
    marginBottom: 28,
  },
  progressHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    letterSpacing: 1,
  },
  progressRow: {
    marginBottom: 14,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 14,
    color: '#ccc',
  },
  progressPct: {
    fontSize: 14,
    color: '#888',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  signOutButton: {
    marginTop: 'auto',
    marginBottom: 40,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  signOutText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
