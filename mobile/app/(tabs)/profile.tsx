import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Progress, streak, and settings.</Text>

      {session?.user?.email ? (
        <Text style={styles.email}>{session.user.email}</Text>
      ) : null}

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
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
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 24,
  },
  signOutButton: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  signOutText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
