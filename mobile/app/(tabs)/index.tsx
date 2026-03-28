import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch } from '@/lib/api';

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
};

export default function TodayScreen() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  const fetchNext = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await apiFetch<Lesson>('/lessons/next');
    if (err) {
      setError(err);
    } else {
      setLesson(data);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      setCompleted(false);
      fetchNext();
    }, []),
  );

  const handleComplete = async () => {
    if (!lesson) return;
    setCompleting(true);
    const { error: err } = await apiFetch('/lessons/' + lesson.id + '/complete', {
      method: 'POST',
      headers: { 'Idempotency-Key': `${lesson.id}-${Date.now()}` },
    });
    setCompleting(false);
    if (err) {
      setError(err);
    } else {
      setCompleted(true);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchNext}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={styles.container}>
        <Text style={styles.doneIcon}>&#10003;</Text>
        <Text style={styles.title}>All caught up</Text>
        <Text style={styles.subtitle}>You've completed every lesson. Check back soon.</Text>
      </View>
    );
  }

  if (completed) {
    return (
      <View style={styles.container}>
        <Text style={styles.doneIcon}>&#10003;</Text>
        <Text style={styles.title}>Workout Complete</Text>
        <Text style={styles.subtitle}>Nice work. The Library is now unlocked.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => { setCompleted(false); fetchNext(); }}>
          <Text style={styles.secondaryButtonText}>Next Workout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mins = Math.ceil(lesson.duration_seconds / 60);
  const category = lesson.categories?.[0] ?? '';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>TODAY'S WORKOUT</Text>
      <Text style={styles.title}>{lesson.title}</Text>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaText}>{mins} min</Text>
        </View>
        {category ? (
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>{category}</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity style={styles.button} onPress={handleComplete} disabled={completing}>
        {completing ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Complete Workout</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 32,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  metaChip: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  metaText: {
    color: '#aaa',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginTop: 40,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 24,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  doneIcon: {
    fontSize: 48,
    color: '#4ade80',
    marginBottom: 16,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
  },
});
