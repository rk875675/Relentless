import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { bustCache } from './api-cache';

const FOREGROUND_REFRESH_DEBOUNCE_MS = 30_000;

type AuthState = {
  session: Session | null;
  loading: boolean;
  onboardingComplete: boolean;
  competitionDate: string | null;
  entitlementStatus: string | null;
  hasPremiumAccess: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /** __DEV__ only: marks premium for UX and completes onboarding without StoreKit. */
  completeOnboardingDevBypass: () => Promise<void>;
  /** __DEV__ only: resets onboarding so the route guard redirects back to credibility. */
  resetOnboarding: () => Promise<void>;
  refreshUserState: () => Promise<void>;
  updateCompetitionDate: (date: string | null) => Promise<string | null>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  onboardingComplete: false,
  competitionDate: null,
  entitlementStatus: null,
  hasPremiumAccess: false,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
  completeOnboarding: async () => {},
  completeOnboardingDevBypass: async () => {},
  resetOnboarding: async () => {},
  refreshUserState: async () => {},
  updateCompetitionDate: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [competitionDate, setCompetitionDate] = useState<string | null>(null);
  const [entitlementStatus, setEntitlementStatus] = useState<string | null>(null);
  const [devPremiumBypass, setDevPremiumBypass] = useState(false);

  const fetchUserState = useCallback(async (userId: string) => {
    const [profileRes, entRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('onboarding_completed, competition_date')
        .eq('id', userId)
        .single(),
      supabase
        .from('entitlements')
        .select('status')
        .eq('user_id', userId)
        .single(),
    ]);

    const profile = profileRes.data;
    const ent = entRes.data;

    setOnboardingComplete(profile?.onboarding_completed ?? false);
    setCompetitionDate(profile?.competition_date ?? null);
    setEntitlementStatus(ent?.status ?? 'none');
  }, []);

  const refreshUserState = useCallback(async () => {
    if (!session?.user?.id) return;
    await fetchUserState(session.user.id);
  }, [session?.user?.id, fetchUserState]);

  const lastForegroundRefresh = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && session?.user?.id) {
        const now = Date.now();
        if (now - lastForegroundRefresh.current >= FOREGROUND_REFRESH_DEBOUNCE_MS) {
          lastForegroundRefresh.current = now;
          fetchUserState(session.user.id).catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [session?.user?.id, fetchUserState]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        try {
          await fetchUserState(s.user.id);
        } catch {
          try { await fetchUserState(s.user.id); } catch { /* give up */ }
        }
      }
    }).catch(() => {
      // Auth/network failure — proceed unauthenticated rather than hang forever.
    }).finally(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        if (_event === 'INITIAL_SESSION') return; // already handled by getSession() above
        setSession(s);
        if (s?.user) {
          try {
            await fetchUserState(s.user.id);
          } catch {
            try { await fetchUserState(s.user.id); } catch { /* give up */ }
          }
        } else {
          setOnboardingComplete(false);
          setCompetitionDate(null);
          setEntitlementStatus(null);
          setDevPremiumBypass(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [fetchUserState]);

  const hasPremiumAccess =
    entitlementStatus === 'trial' || entitlementStatus === 'active' || devPremiumBypass;

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  };

  const signUp = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error?.message ?? null;
  };

  const signOut = async () => {
    setDevPremiumBypass(false);
    bustCache();
    await supabase.auth.signOut();
  };

  const completeOnboarding = useCallback(async () => {
    if (!session?.user) return;
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', session.user.id);
    setOnboardingComplete(true);
  }, [session]);

  const completeOnboardingDevBypass = useCallback(async () => {
    if (!__DEV__) return;
    setDevPremiumBypass(true);
    await completeOnboarding();
  }, [completeOnboarding]);

  const resetOnboarding = useCallback(async () => {
    if (!session?.user) return;
    await supabase.from('profiles').update({ onboarding_completed: false }).eq('id', session.user.id);
    setOnboardingComplete(false);
  }, [session]);

  const updateCompetitionDate = useCallback(async (date: string | null): Promise<string | null> => {
    if (!session?.user) return 'Not authenticated';
    const { error } = await supabase
      .from('profiles')
      .update({ competition_date: date })
      .eq('id', session.user.id);
    if (error) return error.message;
    setCompetitionDate(date);
    return null;
  }, [session]);

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      onboardingComplete,
      competitionDate,
      entitlementStatus,
      hasPremiumAccess,
      signIn,
      signUp,
      signOut,
      completeOnboarding,
      completeOnboardingDevBypass,
      resetOnboarding,
      refreshUserState,
      updateCompetitionDate,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
