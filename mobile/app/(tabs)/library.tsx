import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch } from '@/lib/api';

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
};

type LessonsResponse = {
  items: Lesson[];
  page: number;
  limit: number;
  total: number;
};

const MAC_ORDER = ['mindfulness', 'acceptance', 'commitment'];

export default function LibraryScreen() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLessons = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await apiFetch<LessonsResponse>('/lessons?limit=50');
    if (err) {
      setError(err);
    } else if (data) {
      const library = data.items.filter((l) => l.lesson_type !== 'onboarding-sample');
      setLessons(library);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchLessons();
    }, []),
  );

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
        <TouchableOpacity style={styles.retryButton} onPress={fetchLessons}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const grouped = MAC_ORDER.map((cat) => ({
    category: cat,
    items: lessons.filter((l) => l.categories.includes(cat)),
  })).filter((g) => g.items.length > 0);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={grouped}
      keyExtractor={(item) => item.category}
      renderItem={({ item: group }) => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{group.category}</Text>
          {group.items.map((lesson) => {
            const mins = Math.ceil(lesson.duration_seconds / 60);
            const isShort = lesson.lesson_type.includes('short');
            return (
              <View key={lesson.id} style={styles.card}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardTitle}>{lesson.title}</Text>
                  <Text style={styles.cardMeta}>{mins} min</Text>
                </View>
                <View style={[styles.lengthBadge, isShort ? styles.badgeShort : styles.badgeLong]}>
                  <Text style={styles.badgeText}>{isShort ? 'Short' : 'Long'}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  list: {
    flex: 1,
    backgroundColor: '#000',
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'capitalize',
    marginBottom: 12,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  cardMeta: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  lengthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeShort: {
    backgroundColor: '#1e3a2f',
  },
  badgeLong: {
    backgroundColor: '#2a1f3d',
  },
  badgeText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
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
