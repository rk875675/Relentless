import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';

type Props = {
  durationSeconds: number;
  taskList: string[];
  completionMessage: string;
  completionHoldSeconds: number;
  catColor: string;
  onComplete: (collectedText: string) => void;
};

export default function CountdownTimer({
  durationSeconds,
  taskList,
  completionMessage,
  completionHoldSeconds,
  catColor,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'select' | 'running' | 'done'>('select');
  const [selectedTask, setSelectedTask] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [continueEnabled, setContinueEnabled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Enable Continue button after completionHoldSeconds when done.
  useEffect(() => {
    if (phase !== 'done') return;
    setContinueEnabled(false);
    const t = setTimeout(() => setContinueEnabled(true), completionHoldSeconds * 1000);
    return () => clearTimeout(t);
  }, [phase, completionHoldSeconds]);

  const startTimer = () => {
    setPhase('running');
    setElapsed(0);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: durationSeconds * 1000,
      useNativeDriver: false,
    }).start();

    const start = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - start) / 1000);
      setElapsed(secs);
      if (secs >= durationSeconds) {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setPhase('done');
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
    }, 250);
  };

  const remaining = Math.max(0, durationSeconds - elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  if (phase === 'select') {
    return (
      <View style={styles.container}>
        <Text style={[styles.header, { color: catColor }]}>Pick one and hit Start</Text>
        <ScrollView
          style={styles.taskList}
          contentContainerStyle={styles.taskListContent}
          showsVerticalScrollIndicator={false}
        >
          {taskList.map((task, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.taskItem,
                selectedTask === task && { borderColor: catColor, backgroundColor: catColor + '15' },
              ]}
              onPress={() => setSelectedTask(task)}
            >
              <View style={[styles.radio, selectedTask === task && { borderColor: catColor }]}>
                {selectedTask === task && <View style={[styles.radioFill, { backgroundColor: catColor }]} />}
              </View>
              <Text style={styles.taskText}>{task}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={[styles.btn, !selectedTask && styles.btnDisabled]}
          onPress={startTimer}
          disabled={!selectedTask}
        >
          <Text style={styles.btnText}>Start</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <Animated.View style={[styles.container, styles.centered, { opacity: fade }]}>
        <Ionicons name="checkmark-circle" size={64} color={catColor} />
        <Text style={styles.completionText}>{completionMessage}</Text>
        <TouchableOpacity
          style={[styles.btn, !continueEnabled && styles.btnDisabled, { marginTop: spacing.xl }]}
          onPress={() => onComplete('')}
          disabled={!continueEnabled}
        >
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, styles.centered]}>
      <Text style={styles.selectedTaskLabel}>{selectedTask}</Text>
      <View style={[styles.ring, { borderColor: catColor + '30' }]}>
        <Text style={styles.countdownText}>
          {mins}:{secs.toString().padStart(2, '0')}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: catColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  centered: {
    justifyContent: 'center',
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  taskList: { flex: 1, width: '100%' },
  taskListContent: { paddingBottom: spacing.md },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 12,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  taskText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
    marginTop: spacing.sm,
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  ring: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  countdownText: {
    fontSize: 56,
    fontWeight: '200',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  selectedTaskLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  progressTrack: {
    width: '80%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  completionText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 32,
  },
});
