import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/lib/theme';

type Props = {
  onGoogle: () => void;
  onApple: () => void;
  googleLoading: boolean;
  appleLoading: boolean;
  /** Tighter spacing when stacked above email form */
  variant?: 'hub' | 'login';
};

export function AuthSocialSignInButtons({
  onGoogle,
  onApple,
  googleLoading,
  appleLoading,
  variant = 'hub',
}: Props) {
  const busy = googleLoading || appleLoading;
  const compact = variant === 'login';

  return (
    <View style={compact ? styles.wrapLogin : styles.wrapHub}>
      {!compact ? null : (
        <Text style={styles.orLabel}>Or continue with</Text>
      )}
      <TouchableOpacity
        style={[styles.googleBtn, compact && styles.googleBtnCompact]}
        onPress={onGoogle}
        disabled={busy}
        activeOpacity={0.85}
      >
        {googleLoading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <>
            <Ionicons name="logo-google" size={22} color={colors.background} style={styles.btnIcon} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <TouchableOpacity
          style={[styles.appleBtn, compact && styles.appleBtnCompact]}
          onPress={onApple}
          disabled={busy}
          activeOpacity={0.85}
        >
          {appleLoading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons name="logo-apple" size={24} color={colors.background} style={styles.btnIcon} />
              <Text style={styles.appleText}>Continue with Apple</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapHub: {},
  wrapLogin: { marginBottom: spacing.md },
  orLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  googleBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  googleBtnCompact: { marginBottom: 10 },
  googleText: { color: colors.background, fontSize: 16, fontWeight: '600' },
  btnIcon: { marginRight: 8 },
  appleBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  appleBtnCompact: { marginBottom: 16 },
  appleText: { color: colors.background, fontSize: 16, fontWeight: '600' },
});
